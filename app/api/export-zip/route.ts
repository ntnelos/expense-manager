import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import JSZip from 'jszip';
import { google } from 'googleapis';

function getDriveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !privateKey) {
    throw new Error('Missing Google credentials');
  }

  if ((privateKey.startsWith('"') && privateKey.endsWith('"')) ||
      (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  return google.drive({ version: 'v3', auth });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month'); // YYYY-MM
    const status = searchParams.get('status'); // all, matched, pending
    const downloadCount = searchParams.get('downloadCount'); // all, zero, one

    if (!month) {
      return NextResponse.json({ error: 'Month is required' }, { status: 400 });
    }

    const startDate = `${month}-01`;
    const endYear = parseInt(month.split('-')[0]);
    const endMonth = parseInt(month.split('-')[1]);
    const nextMonth = endMonth === 12 ? 1 : endMonth + 1;
    const nextYear = endMonth === 12 ? endYear + 1 : endYear;
    const endDate = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`;

    const supabase = createServerClient();
    
    let query = supabase
      .from('invoices')
      .select('id, original_filename, drive_file_id, invoice_date, download_count, supplier_name')
      .gte('invoice_date', startDate)
      .lt('invoice_date', endDate)
      .not('drive_file_id', 'is', null);

    if (status === 'matched') {
      query = query.in('status', ['fully_matched', 'partially_matched', 'approved_no_expense']);
    } else if (status === 'pending') {
      query = query.in('status', ['new']);
    }

    if (downloadCount === 'zero') {
      query = query.eq('download_count', 0);
    } else if (downloadCount === 'one') {
      query = query.eq('download_count', 1);
    }

    const { data: invoices, error } = await query;

    if (error) throw error;
    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ error: 'No invoices found for the selected criteria' }, { status: 404 });
    }

    const zip = new JSZip();
    const drive = getDriveClient();
    const idsToUpdate: string[] = [];

    // Track used names to prevent collisions in zip
    const nameCount = new Map<string, number>();

    for (const invoice of invoices) {
      if (!invoice.drive_file_id) continue;
      try {
        const res = await drive.files.get(
          { fileId: invoice.drive_file_id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );

        if (res.data) {
          let fileName = invoice.original_filename || `invoice_${invoice.id}`;
          // Ensure valid filename
          fileName = fileName.replace(/[^a-zA-Z0-9.\-_א-ת ]/g, '');
          
          if (nameCount.has(fileName)) {
            const count = nameCount.get(fileName)! + 1;
            nameCount.set(fileName, count);
            const extMatch = fileName.match(/(\\.[^.]+)$/);
            const ext = extMatch ? extMatch[0] : '';
            const base = extMatch ? fileName.slice(0, -ext.length) : fileName;
            fileName = `${base}_${count}${ext}`;
          } else {
            nameCount.set(fileName, 1);
          }

          zip.file(fileName, res.data as ArrayBuffer);
          idsToUpdate.push(invoice.id);
        }
      } catch (err) {
        console.warn(`Failed to fetch file for invoice ${invoice.id}:`, err);
      }
    }

    if (idsToUpdate.length === 0) {
      return NextResponse.json({ error: 'Failed to retrieve files from Google Drive' }, { status: 500 });
    }

    // Generate zip buffer
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    // Update download count for successfully added files
    // Use a postgres rpc or loop. Since we just want to increment, doing it directly is tricky without RPC, 
    // but we can just loop and do an update for each or fetch and update if there are few.
    // Given the limit is small for a month usually, a loop of promises is fine.
    await Promise.all(
      invoices
        .filter(inv => idsToUpdate.includes(inv.id))
        .map(inv => 
          supabase
            .from('invoices')
            .update({ download_count: inv.download_count + 1 })
            .eq('id', inv.id)
        )
    );

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="invoices_${month}.zip"`,
      },
    });

  } catch (err: any) {
    console.error('ZIP Export error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
