import { google } from 'googleapis';
import { createServerClient } from '@/lib/supabase/server';
import { uploadToGoogleDrive } from '../google/drive';
import { extractInvoiceFromPDF, extractInvoiceFromImage } from '../ocr/extract';
import { generateSHA256Hash } from '../utils/hash';

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
  
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
    console.error('[Gmail Sync] Missing Google OAuth environment variables');
    return { success: false, message: 'Missing OAuth configuration' };
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  oauth2Client.setCredentials({
    refresh_token: config.refresh_token
  });
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
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
      const attachments: { attachmentId: string, filename: string, mimeType: string }[] = [];
      const findAttachments = (partsList: any[]) => {
        for (const part of partsList) {
          if (part.body?.attachmentId && part.filename) {
            attachments.push({
              attachmentId: part.body.attachmentId,
              filename: part.filename,
              mimeType: part.mimeType || 'application/octet-stream'
            });
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
          
          // Upload to Google Drive
          console.log(`[Gmail Sync] Uploading ${filename} to Google Drive...`);
          const driveResult = await uploadToGoogleDrive(buffer, filename, mimeType, internalDate);
          
          // Run OCR
          console.log(`[Gmail Sync] Running OCR on ${filename}...`);
          let ocrResult;
          const isPDF = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
          
          if (isPDF) {
            ocrResult = await extractInvoiceFromPDF(buffer);
          } else {
            ocrResult = await extractInvoiceFromImage(buffer, mimeType);
          }
          
          // Assign category
          let categoryId = null;
          if (ocrResult.suggested_category) {
            const { data: matchedCategory } = await supabase
              .from('categories')
              .select('id')
              .eq('name', ocrResult.suggested_category)
              .maybeSingle();
            if (matchedCategory) {
              categoryId = matchedCategory.id;
            }
          }
          
          // Save to Database
          await supabase.from('invoices').insert({
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
          });
          
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
