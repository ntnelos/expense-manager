import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { google } from 'googleapis';
import { getDriveClient } from '@/lib/google/drive';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { month, invoiceIds, pdfFileId, excelFileId } = body;

    if (!month || !invoiceIds || !pdfFileId || !excelFileId) {
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

    // 2. Download files from drive
    const pdfRes = await drive.files.get({ fileId: pdfFileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
    const excelRes = await drive.files.get({ fileId: excelFileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });

    const pdfBuffer = Buffer.from(pdfRes.data as ArrayBuffer);
    const excelBuffer = Buffer.from(excelRes.data as ArrayBuffer);

    // 3. Check total size
    const totalSize = pdfBuffer.length + excelBuffer.length;
    if (totalSize > 18 * 1024 * 1024) { // 18MB
      return NextResponse.json({ 
        error: 'הקבצים גדולים מדי לשליחה במייל (מעל 18MB). אנא הורד אותם ושלח עצמאית.',
        tooLarge: true
      }, { status: 413 });
    }

    // 4. Construct raw email message (multipart/mixed)
    const boundary = 'foo_bar_baz';
    const emailTo = '516638053@rivh.it';
    const emailSubject = `חשבוניות - חודש ${month}`;
    
    let message = [
      `To: ${emailTo}`,
      `Subject: =?utf-8?B?${Buffer.from(emailSubject).toString('base64')}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary=${boundary}`,
      '',
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      '',
      `מצורפים קבצי החשבוניות ופירוט התאמות לחודש ${month}.`,
      '',
      `--${boundary}`,
      `Content-Type: application/pdf; name="Invoices_${month}.pdf"`,
      `Content-Disposition: attachment; filename="Invoices_${month}.pdf"`,
      `Content-Transfer-Encoding: base64`,
      '',
      pdfBuffer.toString('base64'),
      '',
      `--${boundary}`,
      `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="Invoices_${month}.xlsx"`,
      `Content-Disposition: attachment; filename="Invoices_${month}.xlsx"`,
      `Content-Transfer-Encoding: base64`,
      '',
      excelBuffer.toString('base64'),
      '',
      `--${boundary}--`
    ].join('\r\n');

    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // 5. Send Email
    try {
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });
    } catch (e: any) {
      console.error("Gmail send error:", e);
      if (e.message?.includes('unauthorized_client')) {
        return NextResponse.json({ error: 'שגיאת הרשאות: יש להוסיף הרשאת gmail.send למסוף ה-Workspace (Domain-Wide Delegation).' }, { status: 403 });
      }
      throw e;
    }

    // 6. Update Status
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ status: 'sent_to_accountant' })
      .in('id', invoiceIds);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Export send error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
