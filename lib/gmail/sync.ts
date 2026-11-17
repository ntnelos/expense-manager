import { google } from 'googleapis';
import { createServerClient } from '@/lib/supabase/server';
import { uploadToGoogleDrive } from '../google/drive';
import { extractInvoiceFromPDF, extractInvoiceFromImage } from '../ocr/extract';
import { generateSHA256Hash } from '../utils/hash';
import { applySupplierAlias } from '../utils/alias';
import { normalizeOcrAmounts } from '../ocr/normalize';
import { autoMatchOnArrival } from '../matching/auto';
import { GmailSyncTracker } from './tracker';

// Route handlers calling this run with maxDuration = 300s. Stop picking up new messages after this
// budget so the run finishes cleanly (checkpoint saved, run marked 'partial') instead of being killed.
const TIME_BUDGET_MS = 240_000;

// A message that fails is retried on later runs, up to this many attempts in total.
const MAX_FAILED_ATTEMPTS = 3;

const FAILED_TABLE = 'gmail_sync_failed_messages';

type QueuedMessage = { id: string; retryAttempts: number | null }; // retryAttempts = null → new message

export async function syncGmailInvoices(options: { triggerType?: 'manual' | 'cron' } = {}) {
  const triggerType = options.triggerType || 'manual';
  const startedAtMs = Date.now();

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
    
    // 3. List ALL matching messages (follow pagination).
    // Gmail returns newest first, so stopping at the first page would drop the older messages
    // for good once the checkpoint moves past them.
    const rawMessages: { id: string }[] = [];
    try {
      let pageToken: string | undefined;
      do {
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 500,
          pageToken
        });
        for (const m of response.data.messages || []) {
          if (m.id) rawMessages.push({ id: m.id });
        }
        pageToken = response.data.nextPageToken || undefined;
      } while (pageToken);
    } catch (err: any) {
      console.error('[Gmail Sync] Error fetching messages from Gmail API:', err);
      const msg = `שגיאה בתקשורת עם Google Gmail API: ${err.message || err}`;
      await GmailSyncTracker.failRun(msg);
      return { success: false, message: msg };
    }

    // 3b. Load messages that failed in earlier runs and should be retried.
    let failedTableAvailable = true;
    const priorAttempts = new Map<string, number>(); // message_id → attempts so far
    const retryQueue: QueuedMessage[] = [];
    {
      const { data: failedRows, error: failedErr } = await supabase
        .from(FAILED_TABLE)
        .select('message_id, attempts')
        .order('first_failed_at', { ascending: true });

      if (failedErr) {
        failedTableAvailable = false;
        console.warn('[Gmail Sync] Failed-messages table unavailable:', failedErr);
        GmailSyncTracker.log('warn', `טבלת ניסיונות חוזרים (${FAILED_TABLE}) אינה זמינה - יש להריץ את מיגרציה 017. עד אז, הודעה שנכשלת תעצור את קידום נקודת הסריקה כדי שלא תאבד.`);
      } else {
        const newIds = new Set(rawMessages.map(m => m.id));
        for (const row of failedRows || []) {
          priorAttempts.set(row.message_id, row.attempts);
          if (!newIds.has(row.message_id) && row.attempts < MAX_FAILED_ATTEMPTS) {
            retryQueue.push({ id: row.message_id, retryAttempts: row.attempts });
          }
        }
        if (retryQueue.length > 0) {
          GmailSyncTracker.log('info', `נמצאו ${retryQueue.length} הודעות שנכשלו בעבר - מנסה שוב.`);
        }
      }
    }

    // A message can be both new (after the checkpoint) and already failed before, e.g. when it was
    // the newest one in the previous run. Keep its attempt count, and skip it once it's exhausted.
    const newMessages: QueuedMessage[] = [];
    for (const m of [...rawMessages].reverse()) {
      const attempts = priorAttempts.get(m.id);
      if (attempts !== undefined && attempts >= MAX_FAILED_ATTEMPTS) {
        GmailSyncTracker.log('warn', `הודעה ${m.id} נכשלה כבר ${attempts} פעמים - מדלג (שמורה ב-${FAILED_TABLE} לבדיקה ידנית).`);
        continue;
      }
      newMessages.push({ id: m.id, retryAttempts: attempts ?? null });
    }

    if (newMessages.length === 0 && retryQueue.length === 0) {
      GmailSyncTracker.log('info', 'לא נמצאו הודעות חדשות מאז הסריקה האחרונה.');
      GmailSyncTracker.updateProgress(0, 0, 'לא נמצאו הודעות חדשות');
      await GmailSyncTracker.completeRun(0);
      return { success: true, count: 0, last_sync_at: config.last_sync_at };
    }

    // Retries first (they are older than the checkpoint, so they don't move it), then new messages
    // in chronological order (OLDEST FIRST) so the checkpoint moves forward progressively.
    const messages: QueuedMessage[] = [...retryQueue, ...newMessages];

    GmailSyncTracker.log('info', `נמצאו ${newMessages.length} הודעות מייל חדשות לסריקה (נסרקות בסדר כרונולוגי).`);
    GmailSyncTracker.updateProgress(0, messages.length, `מתחיל סריקה של ${messages.length} הודעות...`);

    let processedCount = 0;
    let failedCount = 0;
    const savedInvoiceIds: string[] = []; // auto-matched to card lines at the end of the run
    let remainingMessages = 0;
    // Once true, the checkpoint stays put for the rest of the run: a message failed and could not be
    // queued for retry, so moving past it would lose it.
    let checkpointFrozen = false;
    let newestMessageDate = config.last_sync_at ? new Date(config.last_sync_at) : new Date('2026-06-10T00:00:00Z');

    for (let i = 0; i < messages.length; i++) {
      const msgRef = messages[i];
      const isRetry = msgRef.retryAttempts !== null;
      const msgIndexStr = `${i + 1}/${messages.length}${isRetry ? ' ניסיון חוזר' : ''}`;
      let subjectForLog: string | null = null;

      if (Date.now() - startedAtMs > TIME_BUDGET_MS) {
        remainingMessages = messages.length - i;
        break;
      }

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
        subjectForLog = subjectHeader;

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

            // Foreign currency → ILS, credit notes negative (shared with the other intake paths).
            // Stored total_amount is in ILS, so dedupe compares against the converted amount.
            const amounts = await normalizeOcrAmounts(ocrResult);

            // 3. Deduplication and Document Hierarchy Logic
            let skip = false;
            let updateExistingId = null;

            if (ocrResult.invoice_date && amounts.totalAmount !== null) {
              let dupQuery = supabase
                .from('invoices')
                .select('id, document_type')
                .eq('invoice_date', ocrResult.invoice_date)
                .eq('total_amount', amounts.totalAmount);
                
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
              invoice_number: ocrResult.invoice_number,
              invoice_date: ocrResult.invoice_date,
              currency: amounts.currency,
              original_amount: amounts.originalAmount,
              total_amount: amounts.totalAmount,
              vat_amount: ocrResult.vat_amount,
              document_type: ocrResult.document_type,
              category_id: categoryId,
              raw_ocr_data: ocrResult as any,
              status: 'new'
            };
            
            if (updateExistingId) {
               const { error: updateError } = await supabase.from('invoices').update(invoicePayload).eq('id', updateExistingId);
               if (updateError) throw new Error(`עדכון החשבונית במסד הנתונים נכשל: ${updateError.message}`);
               savedInvoiceIds.push(updateExistingId);
               GmailSyncTracker.log('success', `[${msgIndexStr}] שודרג בהצלחה: ${ocrResult.supplier_name || filename} (סכום: ₪${amounts.totalAmount || 0})`);
            } else {
               const { data: insertedInvoice, error: insertError } = await supabase.from('invoices').insert(invoicePayload).select('id').single();
               if (insertError) throw new Error(`שמירת החשבונית במסד הנתונים נכשלה: ${insertError.message}`);
               if (insertedInvoice?.id) savedInvoiceIds.push(insertedInvoice.id);
               GmailSyncTracker.log('success', `[${msgIndexStr}] נקלט בהצלחה: ${ocrResult.supplier_name || filename} (סכום: ₪${amounts.totalAmount || 0})`);
            }
            
            processedCount++;
          }
        }
        
        // A retried message succeeded → remove it from the retry queue.
        if (isRetry) {
          await supabase.from(FAILED_TABLE).delete().eq('message_id', msgRef.id);
          GmailSyncTracker.log('success', `[${msgIndexStr}] ההודעה "${subjectHeader.slice(0, 45)}" עובדה בהצלחה בניסיון חוזר.`);
        }

        // INCREMENTAL CHECKPOINT UPDATE:
        // Update DB checkpoint after EACH processed message so a timeout doesn't lose progress.
        if (!checkpointFrozen && internalDate > newestMessageDate) {
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
        failedCount++;
        const errText = String(msgErr?.message || msgErr).slice(0, 1000);
        console.error(`[Gmail Sync] Error processing message ${msgRef.id}:`, msgErr);
        GmailSyncTracker.log('error', `[${msgIndexStr}] שגיאה בעיבוד הודעה${subjectForLog ? ` "${subjectForLog.slice(0, 45)}"` : ''}: ${errText}`);

        // Queue the message for retry so moving the checkpoint past it doesn't lose it.
        const attempts = (msgRef.retryAttempts ?? 0) + 1;
        let queued = false;
        if (failedTableAvailable) {
          const { error: upsertErr } = await supabase
            .from(FAILED_TABLE)
            .upsert({
              message_id: msgRef.id,
              subject: subjectForLog,
              attempts,
              last_error: errText,
              last_attempt_at: new Date().toISOString()
            }, { onConflict: 'message_id' });
          queued = !upsertErr;
          if (upsertErr) console.error('[Gmail Sync] Could not record failed message:', upsertErr);
        }

        if (queued) {
          if (attempts >= MAX_FAILED_ATTEMPTS) {
            GmailSyncTracker.log('error', `[${msgIndexStr}] ההודעה נכשלה ${attempts} פעמים ולא תנוסה שוב אוטומטית. היא שמורה בטבלה ${FAILED_TABLE} לבדיקה ידנית.`);
          } else {
            GmailSyncTracker.log('warn', `[${msgIndexStr}] ההודעה תנוסה שוב בסריקה הבאה (ניסיון ${attempts}/${MAX_FAILED_ATTEMPTS}).`);
          }
        } else if (!isRetry && !checkpointFrozen) {
          checkpointFrozen = true;
          GmailSyncTracker.log('warn', `[${msgIndexStr}] לא ניתן לשמור את ההודעה לניסיון חוזר - נקודת הסריקה לא תתקדם מעבר לה, כדי שתיסרק שוב בהרצה הבאה.`);
        }
      }
    }

    if (failedCount > 0) {
      GmailSyncTracker.log('warn', `${failedCount} הודעות נכשלו בעיבוד בהרצה זו.`);
    }

    if (savedInvoiceIds.length > 0) {
      const autoMatched = await autoMatchOnArrival(supabase, { invoiceIds: savedInvoiceIds });
      for (const m of autoMatched) {
        GmailSyncTracker.log('success', `🔗 הותאמה אוטומטית: ${m.supplierName || 'חשבונית'} ← "${m.lineDescription}" (₪${m.lineAmount})`);
      }
      GmailSyncTracker.log('info', `התאמה אוטומטית: ${autoMatched.length} מתוך ${savedInvoiceIds.length} חשבוניות חדשות הותאמו לחיובי כרטיס. השאר ממתינות בזירת ההתאמות.`);
    }

    await GmailSyncTracker.completeRun(processedCount, { remainingMessages });

    return {
      success: true,
      count: processedCount,
      failed: failedCount,
      remaining: remainingMessages,
      hasMore: remainingMessages > 0,
      last_sync_at: newestMessageDate.toISOString(),
      runId: runId
    };
  } catch (error: any) {
    console.error('[Gmail Sync] Fatal error during sync:', error);
    await GmailSyncTracker.failRun(error.message || 'שגיאה כללית בסריקה');
    return { success: false, message: error.message || 'שגיאה כללית' };
  }
}
