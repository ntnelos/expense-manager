import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { google } from 'googleapis';
import { getDriveClient } from '@/lib/google/drive';

export const maxDuration = 300; // 5 minutes max duration for this endpoint

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { month, invoiceIds, pdfFileIds, excelFileId } = body;

    if (!month || !invoiceIds || !pdfFileIds || !Array.isArray(pdfFileIds) || !excelFileId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const supabase = createServerClient();
    
    // 1. Get configuration
    const { data: config, error: configError } = await supabase
      .from('gmail_sync_config')
      .select('*')
      .maybeSingle();
      
    if (configError || !config) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 });
    }

    let formattedKey = process.env.GOOGLE_PRIVATE_KEY || '';
    if ((formattedKey.startsWith('"') && formattedKey.endsWith('"')) || (formattedKey.startsWith("'") && formattedKey.endsWith("'"))) {
      formattedKey = formattedKey.slice(1, -1);
    }
    formattedKey = formattedKey.replace(/\\n/g, '\n');

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: formattedKey,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: config.email_address 
    });
    
    const gmail = google.gmail({ version: 'v1', auth });
    const drive = getDriveClient();

    // 2. Download Excel once
    const excelRes = await drive.files.get({ fileId: excelFileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
    const excelBuffer = Buffer.from(excelRes.data as ArrayBuffer);

    const emailTo = '516638053@rivh.it';

    // 3. Loop over PDFs and send emails
    for (let i = 0; i < pdfFileIds.length; i++) {
      const pdfId = pdfFileIds[i];
      const isFirst = i === 0;
      const totalParts = pdfFileIds.length;
      
      const pdfRes = await drive.files.get({ fileId: pdfId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
      const pdfBuffer = Buffer.from(pdfRes.data as ArrayBuffer);

      // Check size for this email
      const thisEmailSize = pdfBuffer.length + (isFirst ? excelBuffer.length : 0);
      if (thisEmailSize > 18 * 1024 * 1024) { // 18MB
        return NextResponse.json({ 
          error: `קובץ החשבוניות (חלק ${i + 1}) גדול מדי לשליחה במייל (מעל 18MB). אנא הורד אותו ושלח עצמאית.`,
          tooLarge: true
        }, { status: 413 });
      }

      const boundary = 'foo_bar_baz';
      const emailSubject = totalParts > 1 
        ? `חשבוניות - חודש ${month} (חלק ${i + 1} מתוך ${totalParts})` 
        : `חשבוניות - חודש ${month}`;
      
      const bodyText = totalParts > 1
        ? `מצורפים קבצי החשבוניות לחודש ${month} - חלק ${i + 1} מתוך ${totalParts}.\n${isFirst ? 'בקובץ מצורף גם פירוט ההתאמות באקסל.' : ''}`
        : `מצורפים קבצי החשבוניות ופירוט התאמות לחודש ${month}.`;

      let messageLines = [
        `To: ${emailTo}`,
        `Subject: =?utf-8?B?${Buffer.from(emailSubject).toString('base64')}?=`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary=${boundary}`,
        '',
        `--${boundary}`,
        `Content-Type: text/plain; charset="UTF-8"`,
        '',
        bodyText,
        '',
        `--${boundary}`,
        `Content-Type: application/pdf; name="Invoices_${month}_part${i + 1}.pdf"`,
        `Content-Disposition: attachment; filename="Invoices_${month}_part${i + 1}.pdf"`,
        `Content-Transfer-Encoding: base64`,
        '',
        pdfBuffer.toString('base64'),
        ''
      ];

      if (isFirst) {
        messageLines = messageLines.concat([
          `--${boundary}`,
          `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="Invoices_${month}.xlsx"`,
          `Content-Disposition: attachment; filename="Invoices_${month}.xlsx"`,
          `Content-Transfer-Encoding: base64`,
          '',
          excelBuffer.toString('base64'),
          ''
        ]);
      }

      messageLines.push(`--${boundary}--`);
      
      const encodedMessage = Buffer.from(messageLines.join('\r\n'))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      try {
        await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage
          }
        });
      } catch (sendErr: any) {
        console.error(`Failed to send email part ${i + 1}:`, sendErr);
        if (sendErr.message?.includes('unauthorized_client')) {
          return NextResponse.json({ error: 'שגיאת הרשאות: יש להוסיף הרשאת gmail.send למסוף ה-Workspace (Domain-Wide Delegation).' }, { status: 403 });
        }
        throw new Error(`שגיאה בשליחת חלק ${i + 1} מתוך ${totalParts}`);
      }

      // Small delay between emails to avoid hitting rate limits
      if (i < pdfFileIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 4. Update sent_to_accountant flag
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ sent_to_accountant: true })
      .in('id', invoiceIds);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Export send error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
