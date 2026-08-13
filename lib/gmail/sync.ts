import { google } from 'googleapis';
import { createServerClient } from '@/lib/supabase/server';
import { uploadToGoogleDrive } from '../google/drive';
import { extractInvoiceFromPDF, extractInvoiceFromImage } from '../ocr/extract';
import { generateSHA256Hash } from '../utils/hash';
import { applySupplierAlias } from '../utils/alias';
import { GmailSyncTracker } from './tracker';

export async function syncGmailInvoices(options: { triggerType?: 'manual' | 'cron' } = {}) {
  const triggerType = options.triggerType || 'manual';
  
  // Check if a sync is already running
  const existingActive = GmailSyncTracker.getActiveRun();
  if (existingActive && existingActive.status === 'running') {
    return {
      success: true,
      alreadyRunning: true,
      runId: existingActive.id,
      message: 'סריקה כבר רצה ברקע'
    };
  }

  // Start new run in tracker
  const currentRun = await GmailSyncTracker.startRun(triggerType);
  const runId = currentRun.id;

  const supabase = createServerClient();
  
  try {
    GmailSyncTracker.log('info', 'בודק הגדרות חיבור ל-Gmail...');
    
    // 1. Get configuration
    const { data: config, error: configError } = await supabase
      .from('gmail_sync_config')
      .select('*')
      .maybeSingle();
      
    if (configError || !config) {
      const msg = 'לא נמצאה תצורת חשבון Gmail מוגדרת.';
      await GmailSyncTracker.failRun(msg);
      return { success: false, message: msg };
    }
    
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      const msg = 'חסרים משתני סביבה של Google Service Account בשרת.';
      await GmailSyncTracker.failRun(msg);
      return { success: false, message: msg };
    }

    GmailSyncTracker.log('info', `מתחבר ל-Gmail API עבור תיבת: ${config.email_address}...`);

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
    
    const lastDateStr = config.last_sync_at ? new Date(config.last_sync_at).toLocaleDateString('he-IL') : 'תחילת הפעילות';
    GmailSyncTracker.log('info', `מחפש מיילים עם קבצים מצורפים החל מתאריך ${lastDateStr}...`);
    
    // 3. List messages
    let response;
    try {
      response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 100 // Process up to 100 emails at a time
      });
    } catch (err: any) {
      console.error('[Gmail Sync] Error fetching messages from Gmail API:', err);
      const msg = `שגיאה בתקשורת עם Google Gmail API: ${err.message || err}`;
      await GmailSyncTracker.failRun(msg);
      return { success: false, message: msg };
    }
    
    const rawMessages = response.data.messages || [];
    
    if (rawMessages.length === 0) {
      GmailSyncTracker.log('info', 'לא נמצאו הודעות חדשות מאז הסריקה האחרונה.');
      GmailSyncTracker.updateProgress(0, 0, 'לא נמצאו הודעות חדשות');
      await GmailSyncTracker.completeRun(0);
      return { success: true, count: 0, last_sync_at: config.last_sync_at };
    }

    // Reverse messages to process in chronological order (OLDEST FIRST)
    // This ensures checkpoint moves forward progressively!
    const messages = [...rawMessages].reverse();

    GmailSyncTracker.log('info', `נמצאו ${messages.length} הודעות מייל לסריקה (נסרקות בסדר כרונולוגי).`);
    GmailSyncTracker.updateProgress(0, messages.length, `מתחיל סריקה של ${messages.length} הודעות...`);
    
    let processedCount = 0;
    const scanStartTime = new Date();
    let newestMessageDate = config.last_sync_at ? new Date(config.last_sync_at) : new Date('2026-06-10T00:00:00Z');
    
    for (let i = 0; i < messages.length; i++) {
      const msgRef = messages[i];
      const msgIndexStr = `${i + 1}/${messages.length}`;
      
      try {
        GmailSyncTracker.updateProgress(i + 1, messages.length, `בודק הודעה (${msgIndexStr})...`);

        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: msgRef.id!
        });
        
        const message = msgRes.data;
        const internalDate = new Date(parseInt(message.internalDate!));
        
        // Extract Subject header if available
        const headers = message.payload?.headers || [];
        const subjectHeader = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || '(ללא נושא)';
        
        // Look for attachments in parts
        const parts = message.payload?.parts || [];
        
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
                  lowerName.startsWith('image00')
                ) {
                  isSignatureImage = true;
                }
              }

              if (isSignatureImage) {
                GmailSyncTracker.log('warn', `[${msgIndexStr}] דילוג על תמונת חתימה: ${part.filename} (${Math.round(size/1024)}KB)`);
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

        if (attachments.length === 0) {
          GmailSyncTracker.log('info', `[${msgIndexStr}] נושא: "${subjectHeader.slice(0, 45)}" - לא נמצאו קבצים רלוונטיים.`);
        }

        for (const att of attachments) {
          const { filename, mimeType, attachmentId, size } = att;
          
          if (
            mimeType === 'application/pdf' || 
            mimeType?.startsWith('image/') ||
            filename.toLowerCase().endsWith('.pdf') ||
            filename.toLowerCase().endsWith('.jpg') ||
            filename.toLowerCase().endsWith('.jpeg') ||
            filename.toLowerCase().endsWith('.png')
          ) {
            GmailSyncTracker.log('info', `[${msgIndexStr}] מוריד קובץ מצורף: ${filename} (${Math.round(size / 1024)}KB)...`);

            // Download attachment
            const attachRes = await gmail.users.messages.attachments.get({
              userId: 'me',
              messageId: message.id!,
              id: attachmentId
            });
            
            const base64Data = attachRes.data.data!;
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
              GmailSyncTracker.log('info', `[${msgIndexStr}] קובץ ${filename} כבר קיים במערכת (לפי תוכן זהה) - מדלג.`);
              continue;
            }
            
            // 1. Run OCR FIRST (before uploading to Drive)
            GmailSyncTracker.log('info', `[${msgIndexStr}] מפענח נתונים ב-OCR ו-AI עבור: ${filename}...`);
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
              GmailSyncTracker.log('warn', `[${msgIndexStr}] המסמך ${filename} סווג כ-'other' (לא חשבונית/קבלה) - מדלג.`);
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
                    GmailSyncTracker.log('info', `[${msgIndexStr}] קיימת כבר חשבונית מס עבור קבלה זו (${filename}) - מדלג.`);
                    skip = true;
                    break;
                  } else if ((ocrResult.document_type === 'tax_invoice' || ocrResult.document_type === 'tax_invoice_receipt') && dup.document_type === 'receipt') {
                    GmailSyncTracker.log('info', `[${msgIndexStr}] משדרג קבלה קיימת לחשבונית מס: ${filename}`);
                    updateExistingId = dup.id;
                    break;
                  } else if (ocrResult.document_type === dup.document_type) {
                    GmailSyncTracker.log('info', `[${msgIndexStr}] מסמך כפול זהה (${filename}) - מדלג.`);
                    skip = true;
                    break;
                  }
                }
              }
            }
            
            if (skip) continue;
            
            // 4. Upload to Google Drive
            const extension = filename.split('.').pop() || 'pdf';
            const supplier = ocrResult.supplier_name ? ocrResult.supplier_name.replace(/[^a-zA-Z0-9א-ת ]/g, '').trim() : 'Unknown';
            const invoiceDate = ocrResult.invoice_date || new Date().toISOString().split('T')[0];
            const newFilename = `${supplier}_${invoiceDate}.${extension}`;
            
            GmailSyncTracker.log('info', `[${msgIndexStr}] מעלה ל-Google Drive: "${newFilename}"...`);
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
            
            // 6. Save to Database
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
               await supabase.from('invoices').update(invoicePayload).eq('id', updateExistingId);
               GmailSyncTracker.log('success', `[${msgIndexStr}] שודרג בהצלחה: ${ocrResult.supplier_name || filename} (סכום: ₪${ocrResult.total_amount || 0})`);
            } else {
               await supabase.from('invoices').insert(invoicePayload);
               GmailSyncTracker.log('success', `[${msgIndexStr}] נקלט בהצלחה: ${ocrResult.supplier_name || filename} (סכום: ₪${ocrResult.total_amount || 0})`);
            }
            
            processedCount++;
          }
        }
        
        // INCREMENTAL CHECKPOINT UPDATE:
        // Update DB checkpoint after EACH processed message so progress is never lost or repeated!
        if (internalDate > newestMessageDate) {
          newestMessageDate = internalDate;
          await supabase
            .from('gmail_sync_config')
            .update({
              last_sync_at: newestMessageDate.toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', config.id);
        }
      } catch (msgErr: any) {
        console.error(`[Gmail Sync] Error processing message ${msgRef.id}:`, msgErr);
        GmailSyncTracker.log('error', `[${msgIndexStr}] שגיאה בעיבוד הודעה: ${msgErr.message || msgErr}`);
      }
    }
    
    // Final checkpoint update to the newest date or scan start time
    const finalSyncDate = messages.length > 0 && newestMessageDate > (config.last_sync_at ? new Date(config.last_sync_at) : new Date(0))
      ? newestMessageDate.toISOString()
      : scanStartTime.toISOString();

    await supabase
      .from('gmail_sync_config')
      .update({
        last_sync_at: finalSyncDate,
        updated_at: new Date().toISOString()
      })
      .eq('id', config.id);

    await GmailSyncTracker.completeRun(processedCount);

    return { 
      success: true, 
      count: processedCount, 
      last_sync_at: finalSyncDate,
      runId: runId
    };
  } catch (error: any) {
    console.error('[Gmail Sync] Fatal error during sync:', error);
    await GmailSyncTracker.failRun(error.message || 'שגיאה כללית בסריקה');
    return { success: false, message: error.message || 'שגיאה כללית' };
  }
}
