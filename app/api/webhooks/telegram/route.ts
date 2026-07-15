import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getFile, downloadFile, sendMessage } from '@/lib/telegram/bot';
import { extractInvoiceFromImage, extractInvoiceFromPDF } from '@/lib/ocr/extract';
import { generateSHA256Hash } from '@/lib/utils/hash';
import { uploadToGoogleDrive } from '@/lib/google/drive';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Validate it's a message
    if (!body.message) {
      return NextResponse.json({ success: true }); // Acknowledge other types of updates (edits, etc) silently
    }

    const message = body.message;
    const chatId = message.chat.id;
    const telegramUserId = message.from.id;

    // Handle /start or commands
    if (message.text && message.text.startsWith('/start')) {
      await sendMessage(chatId, `שלום! המזהה שלך הוא \`${telegramUserId}\`.\nכדי להשתמש בבוט, עליך להוסיף את המזהה הזה בלוח הבקרה של המערכת.`);
      return NextResponse.json({ success: true });
    }

    // 2. Authorize User
    const supabase = createServerClient();
    const { data: user, error: userError } = await supabase
      .from('telegram_users')
      .select('id, is_active')
      .eq('telegram_user_id', telegramUserId)
      .maybeSingle();

    if (userError || !user) {
      await sendMessage(chatId, `⛔ משתמש לא מזוהה.\nהמזהה שלך: \`${telegramUserId}\`.\nנא להוסיף אותו למערכת כדי להתחיל לשלוח חשבוניות.`);
      return NextResponse.json({ success: true });
    }

    if (!user.is_active) {
      await sendMessage(chatId, `⛔ המשתמש שלך מושהה במערכת.`);
      return NextResponse.json({ success: true });
    }

    // 3. Check for Photo or Document
    let fileIdToDownload: string | null = null;
    let fileName = 'telegram_upload';
    let isPDF = false;

    if (message.photo && message.photo.length > 0) {
      // Photos come in multiple sizes, get the largest one (last in array)
      const largestPhoto = message.photo[message.photo.length - 1];
      fileIdToDownload = largestPhoto.file_id;
      fileName = `telegram_photo_${new Date().getTime()}.jpg`;
    } else if (message.document) {
      fileIdToDownload = message.document.file_id;
      fileName = message.document.file_name || `telegram_doc_${new Date().getTime()}`;
      if (message.document.mime_type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
        isPDF = true;
      } else if (!message.document.mime_type?.startsWith('image/')) {
        await sendMessage(chatId, `⚠️ סוג הקובץ אינו נתמך. ניתן לשלוח רק תמונות או קבצי PDF.`);
        return NextResponse.json({ success: true });
      }
    } else {
      await sendMessage(chatId, `אנא שלח תמונה או קובץ PDF של חשבונית.`);
      return NextResponse.json({ success: true });
    }

    await sendMessage(chatId, `הקובץ התקבל, מפענח נתונים (AI)... ⏳`);

    // 4. Download file from Telegram
    if (!fileIdToDownload) {
      await sendMessage(chatId, `❌ שגיאה לא ידועה במציאת הקובץ.`);
      return NextResponse.json({ success: true });
    }
    const fileMeta = await getFile(fileIdToDownload);
    if (!fileMeta || !fileMeta.file_path) {
      await sendMessage(chatId, `❌ שגיאה בהורדת הקובץ מטלגרם.`);
      return NextResponse.json({ success: true });
    }

    const fileBuffer = await downloadFile(fileMeta.file_path);

    // 5. Check duplicate content_hash
    const contentHash = generateSHA256Hash(fileBuffer);
    const { data: existingInvoice } = await supabase
      .from('invoices')
      .select('id, supplier_name, total_amount')
      .eq('content_hash', contentHash)
      .maybeSingle();

    if (existingInvoice) {
      await sendMessage(chatId, `⚠️ הקובץ הזה כבר קיים במערכת (ספק: ${existingInvoice.supplier_name || 'לא ידוע'}, סכום: ${existingInvoice.total_amount || 'לא ידוע'}).`);
      return NextResponse.json({ success: true });
    }

    // 6. Upload to Drive
    const mimeType = isPDF ? 'application/pdf' : 'image/jpeg';
    const driveResult = await uploadToGoogleDrive(fileBuffer, fileName, mimeType, new Date());

    // 7. Run OCR
    let ocrResult;
    try {
      if (isPDF) {
        ocrResult = await extractInvoiceFromPDF(fileBuffer);
      } else {
        ocrResult = await extractInvoiceFromImage(fileBuffer, mimeType);
      }
    } catch (ocrErr) {
      console.error('OCR Error in Telegram:', ocrErr);
      await sendMessage(chatId, `❌ שגיאה בפענוח הנתונים מהתמונה. הקובץ לא נשמר.`);
      return NextResponse.json({ success: true });
    }

    if (ocrResult.is_credit_note) {
      await sendMessage(chatId, `⚠️ הקובץ זוהה כחשבונית זיכוי/קבלה ולכן לא נשמר במערכת (המערכת כרגע לא תומכת בזיכויים).`);
      return NextResponse.json({ success: true });
    }

    // 8. Assign category
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

    // 9. Save to Database
    const { data: newInvoice, error: insertError } = await supabase
      .from('invoices')
      .insert({
        content_hash: contentHash,
        drive_file_id: driveResult.fileId,
        drive_file_url: driveResult.fileUrl,
        original_filename: fileName,
        source: 'telegram',
        supplier_name: ocrResult.supplier_name,
        supplier_tax_id: ocrResult.supplier_tax_id,
        invoice_date: ocrResult.invoice_date,
        total_amount: ocrResult.total_amount,
        vat_amount: ocrResult.vat_amount,
        document_type: ocrResult.document_type,
        category_id: categoryId,
        raw_ocr_data: ocrResult as any,
        status: 'new'
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to insert Telegram invoice:', insertError);
      await sendMessage(chatId, `❌ שגיאה בשמירת הנתונים במסד הנתונים.`);
      return NextResponse.json({ success: true });
    }

    // 10. Send Success Message
    const summary = `✅ החשבונית נקלטה בהצלחה!\n\n` +
      `🏢 ספק: ${ocrResult.supplier_name || 'לא זוהה'}\n` +
      `💰 סכום: ${ocrResult.total_amount ? '₪' + ocrResult.total_amount : 'לא זוהה'}\n` +
      `📁 קטגוריה: ${ocrResult.suggested_category || 'לא זוהה'}\n\n` +
      `החשבונית ממתינה להתאמה במערכת.`;
      
    await sendMessage(chatId, summary);

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('Telegram webhook global error:', err);
    // Always return 200 to Telegram so it doesn't retry the bad request forever
    return NextResponse.json({ success: true });
  }
}
