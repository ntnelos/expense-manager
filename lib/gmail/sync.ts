import { google } from 'googleapis';
import { createServerClient } from '@/lib/supabase/server';
import { uploadToGoogleDrive } from '../google/drive';
import { extractInvoiceFromPDF, extractInvoiceFromImage } from '../ocr/extract';
import { generateSHA256Hash } from '../utils/hash';
import { applySupplierAlias } from '../utils/alias';

export async function syncGmailInvoices() {
  const supabase = createServerClient();
  
  // 1. Get configuration
  const { data: config, error: configError } = await supabase
    .from('gmail_sync_config')
    .select('*')
    .maybeSingle();
    
  if (configError || !config) {
    console.log('[Gmail Sync] No Gmail sync configuration found.');
    return { success: false, message: 'Gmail not connected' };
  }
  
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.error('[Gmail Sync] Missing Google Service Account environment variables');
    return { success: false, message: 'Missing Service Account configuration' };
  }

  // Format key: Vercel stores env vars with literal \n instead of real newlines.
  let formattedKey = process.env.GOOGLE_PRIVATE_KEY;
  if ((formattedKey.startsWith('"') && formattedKey.endsWith('"')) ||
      (formattedKey.startsWith("'") && formattedKey.endsWith("'"))) {
    formattedKey = formattedKey.slice(1, -1);
  }
  formattedKey = formattedKey.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: formattedKey,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    subject: config.email_address // Domain-Wide Delegation
  });
  
  const gmail = google.gmail({ version: 'v1', auth });
  
  // 2. Build search query
  let query = 'has:attachment (filename:pdf OR filename:jpg OR filename:jpeg OR filename:png)';
  if (config.last_sync_at) {
    const unixTimestamp = Math.floor(new Date(config.last_sync_at).getTime() / 1000);
    query += ` after:${unixTimestamp}`;
  }
  
  console.log(`[Gmail Sync] Query: ${query}`);
  
  // 3. List messages
  let response;
  try {
    response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 100 // Process up to 100 emails at a time to avoid timeout
    });
  } catch (err: any) {
    console.error('[Gmail Sync] Error fetching messages from Gmail API:', err);
    return { success: false, message: 'Failed to connect to Gmail API' };
  }
  
  const messages = response.data.messages || [];
  console.log(`[Gmail Sync] Found ${messages.length} messages to inspect.`);
  
  let processedCount = 0;
  let newestMessageDate = config.last_sync_at ? new Date(config.last_sync_at) : new Date('2026-06-01T00:00:00Z');
  
  for (const msgRef of messages) {
    try {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: msgRef.id!
      });
      
      const message = msgRes.data;
      const internalDate = new Date(parseInt(message.internalDate!));
      
      // Look for attachments in parts
      const parts = message.payload?.parts || [];
      
      // Sometimes emails are multipart/mixed, and parts contain multipart/alternative, etc.
      // A quick recursive function to find all attachments in the email payload tree
      const attachments: { attachmentId: string, filename: string, mimeType: string, size: number }[] = [];
      const findAttachments = (partsList: any[]) => {
        for (const part of partsList) {
          if (part.body?.attachmentId && part.filename) {
            
            // Heuristic to ignore email signature images (logos, social icons)
            const isImage = part.mimeType?.startsWith('image/');
            const lowerName = part.filename.toLowerCase();
            const size = part.body.size || 0;
            
            let isSignatureImage = false;
            
            if (isImage) {
              // 1. If it's a very small image (< 40KB), it's likely a logo/icon
              if (size > 0 && size < 40000) {
                isSignatureImage = true;
              }
              // 2. Check filename for common signature patterns
              else if (
                lowerName.includes('logo') ||
                lowerName.includes('icon') ||
                lowerName.includes('signature') ||
                lowerName.includes('facebook') ||
                lowerName.includes('twitter') ||
                lowerName.includes('linkedin') ||
                lowerName.includes('instagram') ||
                lowerName.startsWith('image00') // common outlook embedded image
              ) {
                isSignatureImage = true;
              }
            }

            if (isSignatureImage) {
              console.log(`[Gmail Sync] Skipping likely signature image: ${part.filename} (${Math.round(size/1024)}KB)`);
            } else {
              attachments.push({
                attachmentId: part.body.attachmentId,
                filename: part.filename,
                mimeType: part.mimeType || 'application/octet-stream',
                size: size
              });
            }
          }
          if (part.parts) {
            findAttachments(part.parts);
          }
        }
      };
      
      findAttachments(parts);

      for (const att of attachments) {
        const { filename, mimeType, attachmentId } = att;
        
        if (
          mimeType === 'application/pdf' || 
          mimeType?.startsWith('image/') ||
          filename.toLowerCase().endsWith('.pdf') ||
          filename.toLowerCase().endsWith('.jpg') ||
          filename.toLowerCase().endsWith('.jpeg') ||
          filename.toLowerCase().endsWith('.png')
        ) {
          // Download attachment
          const attachRes = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: message.id!,
            id: attachmentId
          });
          
          const base64Data = attachRes.data.data!;
          // Gmail base64 is URL-safe base64, which Buffer.from handles correctly if we replace - and _
          const standardBase64 = base64Data.replace(/-/g, '+').replace(/_/g, '/');
          const buffer = Buffer.from(standardBase64, 'base64');
          
          // Deduplication hash
          const contentHash = generateSHA256Hash(buffer);
          
          // Check if already exists
          const { data: existing } = await supabase
            .from('invoices')
            .select('id')
            .eq('content_hash', contentHash)
            .maybeSingle();
            
          if (existing) {
            console.log(`[Gmail Sync] Attachment ${filename} already exists in DB. Skipping.`);
            continue;
          }
          
          // 1. Run OCR FIRST (before uploading to Drive)
          console.log(`[Gmail Sync] Running OCR on ${filename}...`);
          let ocrResult;
          const isPDF = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
          
          if (isPDF) {
            ocrResult = await extractInvoiceFromPDF(buffer);
          } else {
            ocrResult = await extractInvoiceFromImage(buffer, mimeType);
          }
          
          // Apply smart supplier alias translation
          if (ocrResult.supplier_name) {
            ocrResult.supplier_name = await applySupplierAlias(ocrResult.supplier_name);
          }
          
          // 2. Filter out junk documents
          if (ocrResult.document_type === 'other') {
            console.log(`[Gmail Sync] Skipping ${filename} as it is classified as 'other' (e.g., Terms of Use).`);
            continue;
          }
          
          // 3. Deduplication and Document Hierarchy Logic
          let skip = false;
          let updateExistingId = null;
          
          if (ocrResult.invoice_date && ocrResult.total_amount !== null) {
            let dupQuery = supabase
              .from('invoices')
              .select('id, document_type')
              .eq('invoice_date', ocrResult.invoice_date)
              .eq('total_amount', ocrResult.total_amount);
              
            if (ocrResult.supplier_tax_id) {
               dupQuery = dupQuery.eq('supplier_tax_id', ocrResult.supplier_tax_id);
            } else if (ocrResult.supplier_name) {
               dupQuery = dupQuery.eq('supplier_name', ocrResult.supplier_name);
            }
            
            const { data: duplicates } = await dupQuery;
            
            if (duplicates && duplicates.length > 0) {
              for (const dup of duplicates) {
                if (ocrResult.document_type === 'receipt' && (dup.document_type === 'tax_invoice' || dup.document_type === 'tax_invoice_receipt')) {
                  console.log(`[Gmail Sync] Skipping receipt ${filename} because tax_invoice already exists.`);
                  skip = true;
                  break;
                } else if ((ocrResult.document_type === 'tax_invoice' || ocrResult.document_type === 'tax_invoice_receipt') && dup.document_type === 'receipt') {
                  console.log(`[Gmail Sync] Found existing receipt ${dup.id}, will overwrite with tax_invoice ${filename}`);
                  updateExistingId = dup.id;
                  break;
                } else if (ocrResult.document_type === dup.document_type) {
                  console.log(`[Gmail Sync] Skipping duplicate document ${filename} (same type, date, amount).`);
                  skip = true;
                  break;
                }
              }
            }
          }
          
          if (skip) continue;
          
          // 4. Upload to Google Drive (only if we decided to keep it)
          // Smart renaming: Supplier_InvoiceDate.extension
          const extension = filename.split('.').pop() || 'pdf';
          const supplier = ocrResult.supplier_name ? ocrResult.supplier_name.replace(/[^a-zA-Z0-9א-ת ]/g, '').trim() : 'Unknown';
          const invoiceDate = ocrResult.invoice_date || new Date().toISOString().split('T')[0];
          const newFilename = `${supplier}_${invoiceDate}.${extension}`;
          
          console.log(`[Gmail Sync] Uploading ${newFilename} to Google Drive...`);
          // Note: for email sync, if OCR succeeded, it's not error status. If it failed, it threw. 
          const driveDate = ocrResult.invoice_date ? new Date(ocrResult.invoice_date) : internalDate;
          const driveResult = await uploadToGoogleDrive(buffer, newFilename, mimeType, driveDate, 'not_matched');
          
          // 5. Assign category
          let categoryId = null;
          
          if (ocrResult.supplier_name) {
            const { data: previousVendorInvoice } = await supabase
              .from('invoices')
              .select('category_id')
              .eq('supplier_name', ocrResult.supplier_name)
              .not('category_id', 'is', null)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (previousVendorInvoice && previousVendorInvoice.category_id) {
              categoryId = previousVendorInvoice.category_id;
            }
          }

          if (!categoryId && ocrResult.suggested_category) {
            const { data: matchedCategory } = await supabase
              .from('categories')
              .select('id')
              .eq('name', ocrResult.suggested_category)
              .maybeSingle();
            if (matchedCategory) {
              categoryId = matchedCategory.id;
            }
          }
          
          // 6. Save to Database (Insert or Update)
          const invoicePayload = {
            content_hash: contentHash,
            drive_file_id: driveResult.fileId,
            drive_file_url: driveResult.fileUrl,
            original_filename: filename,
            source: 'email',
            supplier_name: ocrResult.supplier_name,
            supplier_tax_id: ocrResult.supplier_tax_id,
            invoice_date: ocrResult.invoice_date,
            total_amount: ocrResult.total_amount,
            vat_amount: ocrResult.vat_amount,
            document_type: ocrResult.document_type,
            category_id: categoryId,
            raw_ocr_data: ocrResult as any,
            status: 'new'
          };
          
          if (updateExistingId) {
             console.log(`[Gmail Sync] Upgrading existing receipt ${updateExistingId} to tax invoice.`);
             await supabase.from('invoices').update(invoicePayload).eq('id', updateExistingId);
          } else {
             await supabase.from('invoices').insert(invoicePayload);
          }
          
          processedCount++;
        }
      }
      
      // Update newest message date only if this message processed without crashing
      if (internalDate > newestMessageDate) {
        newestMessageDate = internalDate;
      }
    } catch (msgErr) {
      console.error(`[Gmail Sync] Error processing message ${msgRef.id}:`, msgErr);
    }
  }
  
  // 4. Update sync settings (even if 0 processed, the date moves forward so we don't query old emails again)
  if (messages.length > 0) {
    await supabase
      .from('gmail_sync_config')
      .update({
        last_sync_at: newestMessageDate.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', config.id);
  }
    
  return { success: true, count: processedCount, last_sync_at: newestMessageDate.toISOString() };
}
