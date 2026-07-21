import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getDriveClient } from '@/lib/google/drive';
import * as XLSX from 'xlsx';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { Readable } from 'stream';

export const maxDuration = 300; // 5 minutes max duration for this endpoint

async function uploadExportToDrive(drive: any, fileName: string, buffer: Buffer, mimeType: string): Promise<{ id: string; url: string }> {
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

  const stream = new Readable();
  stream.push(buffer);
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
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  
  // Set permission to anyone with link so it can be downloaded easily
  await drive.permissions.create({
    fileId: file.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true
  });

  return { id: file.data.id, url: file.data.webViewLink };
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

    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select('*, expense_lines(*), categories(name)')
      .eq('status', 'matched')
      .gte('invoice_date', startDate)
      .lt('invoice_date', endDate)
      .order('invoice_date', { ascending: true });

    if (invError) throw invError;
    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ error: 'לא נמצאו חשבוניות מותאמות בחודש זה' }, { status: 400 });
    }

    const drive = getDriveClient();
    
    // 1. Generate Excel
    const wb = XLSX.utils.book_new();
    const exportData = invoices.map(inv => {
      // Find related expense line if any
      const el = inv.expense_lines && inv.expense_lines.length > 0 ? inv.expense_lines[0] : null;
      return {
        'תאריך החשבונית': inv.invoice_date,
        'תאריך חיוב': el?.charge_date || '',
        'ספק': inv.supplier_name,
        'סכום החשבונית': inv.amount || '',
        'מטבע החשבונית': inv.currency || 'ILS',
        'קטגוריה': inv.categories?.name || 'לא ידוע',
        'סטטוס התאמה': 'נשלח לרו״ח',
        'הוצאה מוכרת': inv.recognized_expense ? 'כן' : 'לא',
        'הערות': el?.notes || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    // 2. Generate Merged PDF
    const mergedPdf = await PDFDocument.create();
    
    for (const inv of invoices) {
      if (!inv.drive_file_id) continue;
      
      try {
        const response = await drive.files.get(
          { fileId: inv.drive_file_id, alt: 'media', supportsAllDrives: true },
          { responseType: 'arraybuffer' }
        );
        const fileBuffer = Buffer.from(response.data as ArrayBuffer);
        const ext = inv.original_filename?.toLowerCase().split('.').pop() || '';
        
        if (ext === 'pdf' || response.headers['content-type'] === 'application/pdf') {
          const donorPdf = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
          const copiedPages = await mergedPdf.copyPages(donorPdf, donorPdf.getPageIndices());
          copiedPages.forEach(page => mergedPdf.addPage(page));
        } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) || response.headers['content-type']?.startsWith('image/')) {
          // Compress image
          const compressedImg = await sharp(fileBuffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
            
          const img = await mergedPdf.embedJpg(compressedImg);
          const { width, height } = img.scale(1);
          const page = mergedPdf.addPage([width, height]);
          page.drawImage(img, { x: 0, y: 0, width, height });
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
      count: invoices.length,
      invoiceIds: invoices.map(i => i.id),
      excel: excelFile,
      pdf: pdfFile
    });

  } catch (error: any) {
    console.error('Export prepare error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
