import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getDriveClient } from '@/lib/google/drive';
import * as XLSX from 'xlsx';
import { generateStyledExcel } from '@/lib/utils/excel';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { Readable } from 'stream';

export const maxDuration = 300; // 5 minutes max duration for this endpoint

async function uploadExportToDrive(drive: any, fileName: string, buffer: Buffer | Uint8Array, mimeType: string): Promise<{ id: string; url: string }> {
  // First, find or create 'Exports' folder in root
  const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  let exportsFolderId;
  const q = rootId 
    ? `name='Exports' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `name='Exports' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    
  const res = await drive.files.list({ q, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true });
  if (res.data.files && res.data.files.length > 0) {
    exportsFolderId = res.data.files[0].id;
  } else {
    const folder = await drive.files.create({ 
      requestBody: { name: 'Exports', mimeType: 'application/vnd.google-apps.folder', parents: rootId ? [rootId] : undefined }, 
      fields: 'id', supportsAllDrives: true 
    });
    exportsFolderId = folder.data.id;
  }

  // Cleanup old files (>24h)
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const cleanupQuery = `'${exportsFolderId}' in parents and createdTime < '${oneDayAgo}' and trashed=false`;
    const oldFiles = await drive.files.list({ q: cleanupQuery, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true });
    for (const f of oldFiles.data.files || []) {
      if (f.id) await drive.files.delete({ fileId: f.id, supportsAllDrives: true }).catch(() => {});
    }
  } catch (e) {
    console.error('Failed to cleanup old exports', e);
  }

  const stream = new Readable();
  stream.push(Buffer.from(buffer));
  stream.push(null);

  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [exportsFolderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: 'id, webViewLink, webContentLink',
    supportsAllDrives: true,
  });
  
  // Set permission to anyone with link so it can be downloaded easily
  await drive.permissions.create({
    fileId: file.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true
  });

  return { id: file.data.id, url: file.data.webContentLink || file.data.webViewLink };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month'); // YYYY-MM
    
    if (!month) {
      return NextResponse.json({ error: 'Missing month parameter' }, { status: 400 });
    }

    const supabase = createServerClient();
    
    // Find all matched invoices for this month
    const startDate = `${month}-01`;
    const endYear = parseInt(month.split('-')[0]);
    const endMonth = parseInt(month.split('-')[1]);
    const nextMonth = endMonth === 12 ? 1 : endMonth + 1;
    const nextYear = endMonth === 12 ? endYear + 1 : endYear;
    const endDate = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`;

    // 1. Fetch matched expense lines
    let query = supabase
      .from('expense_lines')
      .select('*, matches(invoice:invoices(*, categories(name)))')
      .in('status', ['approved', 'approved_no_invoice']);
      
    // Filter by charge_date (or transaction_date if null)
    query = query.or(`and(charge_date.gte.${startDate},charge_date.lt.${endDate}),and(charge_date.is.null,transaction_date.gte.${startDate},transaction_date.lt.${endDate})`);
    query = query.order('transaction_date', { ascending: false });

    const { data: expenseLines, error: expError } = await query;
    if (expError) throw expError;

    // 2. Fetch approved_no_expense invoices (which have no expense line)
    const { data: standaloneInvoices, error: invError } = await supabase
      .from('invoices')
      .select('*, categories(name)')
      .eq('status', 'approved_no_expense')
      .gte('invoice_date', startDate)
      .lt('invoice_date', endDate);

    if (invError) throw invError;

    if ((!expenseLines || expenseLines.length === 0) && (!standaloneInvoices || standaloneInvoices.length === 0)) {
      return NextResponse.json({ error: 'לא נמצאו נתונים בחודש זה' }, { status: 400 });
    }

    const drive = getDriveClient();
    
    // 3. Generate Excel
    const headers = [
      'תאריך עסקה (הוצאה)',
      'תאריך חיוב (הוצאה)',
      'סכום חיוב (הוצאה)',
      'סכום עסקה (הוצאה)',
      'פירוט בנק (הוצאה)',
      'הערה / סיבת אישור',
      'שם ספק (חשבונית)',
      'ח.פ/עוסק (חשבונית)',
      'מספר חשבונית',
      'תאריך חשבונית',
      'סכום חשבונית',
      'מטבע חשבונית',
      'מע״מ (חשבונית)',
      'קטגוריה',
      'סטטוס התאמה',
      'קישור לחשבונית',
    ];

    const exportData: any[] = [];
    const uniqueInvoicesToMerge = new Map<string, any>();
    
    // Process Expense Lines
    for (const line of expenseLines || []) {
      const rawMatches = line.matches;
      const matches = Array.isArray(rawMatches) ? rawMatches : rawMatches ? [rawMatches] : [];
      
      if (matches.length === 0) {
        exportData.push({
          'תאריך עסקה (הוצאה)': line.transaction_date || '',
          'תאריך חיוב (הוצאה)': line.charge_date || '',
          'סכום חיוב (הוצאה)': line.amount || '',
          'סכום עסקה (הוצאה)': line.total_amount || line.amount || '',
          'פירוט בנק (הוצאה)': line.description || '',
          'הערה / סיבת אישור': line.approval_note || '',
          'שם ספק (חשבונית)': '',
          'ח.פ/עוסק (חשבונית)': '',
          'מספר חשבונית': '',
          'תאריך חשבונית': '',
          'סכום חשבונית': '',
          'מטבע חשבונית': '',
          'מע״מ (חשבונית)': '',
          'קטגוריה': '',
          'סטטוס התאמה': 'נשלח לרו״ח',
          'קישור לחשבונית': '',
        });
      } else {
        matches.forEach((match: any, index: number) => {
          const invoice = match.invoice;
          const isDuplicate = index > 0;
          
          if (invoice) {
            uniqueInvoicesToMerge.set(invoice.id, invoice);
          }

          exportData.push({
            'תאריך עסקה (הוצאה)': line.transaction_date || '',
            'תאריך חיוב (הוצאה)': line.charge_date || '',
            'סכום חיוב (הוצאה)': isDuplicate ? `${line.amount} (העתק)` : line.amount,
            'סכום עסקה (הוצאה)': line.total_amount || line.amount || '',
            'פירוט בנק (הוצאה)': isDuplicate ? `${line.description} (העתק)` : line.description,
            'הערה / סיבת אישור': line.approval_note || '',
            'שם ספק (חשבונית)': invoice?.supplier_name || '',
            'ח.פ/עוסק (חשבונית)': invoice?.supplier_tax_id || '',
            'מספר חשבונית': invoice?.invoice_number || '',
            'תאריך חשבונית': invoice?.invoice_date || '',
            'סכום חשבונית': invoice?.total_amount || '',
            'מטבע חשבונית': invoice?.currency || '',
            'מע״מ (חשבונית)': invoice?.vat_amount || '',
            'קטגוריה': invoice?.categories?.name || '',
            'סטטוס התאמה': 'נשלח לרו״ח',
            'קישור לחשבונית': invoice?.drive_file_url || '',
          });
        });
      }
    }

    // Process Standalone Invoices (approved_no_expense)
    for (const inv of standaloneInvoices || []) {
      uniqueInvoicesToMerge.set(inv.id, inv);
      exportData.push({
        'תאריך עסקה (הוצאה)': '',
        'תאריך חיוב (הוצאה)': '',
        'סכום חיוב (הוצאה)': '',
        'סכום עסקה (הוצאה)': '',
        'פירוט בנק (הוצאה)': '',
        'הערה / סיבת אישור': '',
        'שם ספק (חשבונית)': inv.supplier_name || '',
        'ח.פ/עוסק (חשבונית)': inv.supplier_tax_id || '',
        'מספר חשבונית': inv.invoice_number || '',
        'תאריך חשבונית': inv.invoice_date || '',
        'סכום חשבונית': inv.total_amount || '',
        'מטבע חשבונית': inv.currency || '',
        'מע״מ (חשבונית)': inv.vat_amount || '',
        'קטגוריה': inv.categories?.name || '',
        'סטטוס התאמה': 'נשלח לרו״ח',
        'קישור לחשבונית': inv.drive_file_url || '',
      });
    }
    
    const excelBuffer = await generateStyledExcel(headers, exportData, 'Invoices');
    
    // 4. Generate Merged PDF
    const mergedPdf = await PDFDocument.create();
    const allUniqueInvoices = Array.from(uniqueInvoicesToMerge.values());
    const invoicesToProcess = allUniqueInvoices.filter((inv: any) => inv.drive_file_id);
    
    for (const inv of invoicesToProcess) {
      if (!inv.drive_file_id) continue;
      
      try {
        const response = await drive.files.get(
          { fileId: inv.drive_file_id, alt: 'media', supportsAllDrives: true },
          { responseType: 'arraybuffer' }
        );
        const fileBuffer = Buffer.from(response.data as ArrayBuffer);
        const isPDF = fileBuffer.length > 4 && fileBuffer.subarray(0, Math.min(1024, fileBuffer.length)).indexOf('%PDF') !== -1;
        
        if (isPDF) {
          const donorPdf = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
          const copiedPages = await mergedPdf.copyPages(donorPdf, donorPdf.getPageIndices());
          copiedPages.forEach(page => mergedPdf.addPage(page));
        } else {
          // Compress image (assumes not PDF = image)
          try {
            const compressedImg = await sharp(fileBuffer)
              .resize({ width: 1200, withoutEnlargement: true })
              .jpeg({ quality: 80 })
              .toBuffer();
              
            const img = await mergedPdf.embedJpg(compressedImg);
            const { width, height } = img.scale(1);
            const page = mergedPdf.addPage([width, height]);
            page.drawImage(img, { x: 0, y: 0, width, height });
          } catch (sharpError) {
            console.error(`Failed to process image with sharp for file ${inv.drive_file_id}:`, sharpError);
          }
        }
      } catch (e) {
        console.error(`Failed to process file ${inv.drive_file_id}`, e);
      }
    }
    
    const mergedPdfBytes = await mergedPdf.save();
    const pdfBuffer = Buffer.from(mergedPdfBytes);

    // 3. Upload to Google Drive Temp Folder
    const timestamp = new Date().getTime();
    const excelFile = await uploadExportToDrive(drive, `Invoices_${month}_${timestamp}.xlsx`, excelBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const pdfFile = await uploadExportToDrive(drive, `Invoices_${month}_${timestamp}.pdf`, pdfBuffer, 'application/pdf');

    return NextResponse.json({
      success: true,
      count: allUniqueInvoices.length,
      invoiceIds: allUniqueInvoices.map(i => i.id),
      excel: excelFile,
      pdf: pdfFile
    });

  } catch (error: any) {
    console.error('Export prepare error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
