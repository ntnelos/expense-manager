import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getDriveClient } from '@/lib/google/drive';
import * as XLSX from 'xlsx';
import { generateStyledExcel } from '@/lib/utils/excel';
import { PDFDocument } from 'pdf-lib';
import { Readable } from 'stream';
import JSZip from 'jszip';

export const dynamic = 'force-dynamic';
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
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: string, data: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
        } catch (e) {
          console.error("Error enqueuing to stream", e);
        }
      };

      try {
        sendEvent('log', { message: 'מתחיל לאסוף חשבוניות מהמערכת...' });
        const supabase = createServerClient();
        
        const { data: invoices, error: invError } = await supabase
          .from('invoices')
          .select('*, categories(name), matches(expense_line:expense_lines(*))')
          .in('status', ['approved_no_expense', 'fully_matched'])
          .not('sent_to_accountant', 'eq', true);

        if (invError) throw invError;

        if (!invoices || invoices.length === 0) {
          sendEvent('error', { error: 'לא נמצאו חשבוניות להעברה בחודש זה' });
          controller.close();
          return;
        }

        sendEvent('log', { message: `נמצאו ${invoices.length} חשבוניות להעברה. מתחבר לכונן גוגל...` });
        const drive = getDriveClient();
        
        // Generate Excel
        sendEvent('log', { message: 'מייצר קובץ אקסל לפירוט התאמות...' });
        const headers = [
          'תאריך עסקה (הוצאה)', 'תאריך חיוב (הוצאה)', 'סכום חיוב (הוצאה)',
          'סכום עסקה (הוצאה)', 'פירוט בנק (הוצאה)', 'הערה / סיבת אישור',
          'שם ספק (חשבונית)', 'ח.פ/עוסק (חשבונית)', 'מספר חשבונית',
          'תאריך חשבונית', 'סכום חשבונית', 'מטבע חשבונית', 'מע״מ (חשבונית)',
          'קטגוריה', 'סטטוס התאמה', 'קישור לחשבונית',
        ];

        const translateStatus = (status: string) => {
          switch (status) {
            case 'unapproved': return 'ממתין';
            case 'approved': return 'הותאם';
            case 'approved_no_invoice': return 'אושר ללא חשבונית';
            case 'approved_no_expense': return 'אושר ללא הוצאה';
            default: return status || '';
          }
        };

        const exportData: any[] = [];
        const uniqueInvoicesToMerge = new Map<string, any>();
        
        for (const inv of invoices || []) {
          uniqueInvoicesToMerge.set(inv.id, inv);
          const rawMatches = inv.matches;
          const matches = Array.isArray(rawMatches) ? rawMatches : rawMatches ? [rawMatches] : [];
          
          if (matches.length === 0) {
            exportData.push({
              'תאריך עסקה (הוצאה)': '', 'תאריך חיוב (הוצאה)': '', 'סכום חיוב (הוצאה)': '',
              'סכום עסקה (הוצאה)': '', 'פירוט בנק (הוצאה)': '',
              'הערה / סיבת אישור': inv.approval_note || '',
              'שם ספק (חשבונית)': inv.supplier_name || '', 'ח.פ/עוסק (חשבונית)': inv.supplier_tax_id || '',
              'מספר חשבונית': inv.invoice_number || '', 'תאריך חשבונית': inv.invoice_date || '',
              'סכום חשבונית': inv.total_amount || '', 'מטבע חשבונית': inv.currency || '',
              'מע״מ (חשבונית)': inv.vat_amount || '', 'קטגוריה': inv.categories?.name || '',
              'סטטוס התאמה': translateStatus(inv.status),
              'קישור לחשבונית': inv.drive_file_url ? { text: 'צפה בחשבונית', hyperlink: inv.drive_file_url } : '',
            });
          } else {
            matches.forEach((match: any, index: number) => {
              const line = match.expense_line;
              const isDuplicate = index > 0;
              exportData.push({
                'תאריך עסקה (הוצאה)': line?.transaction_date || '',
                'תאריך חיוב (הוצאה)': line?.charge_date || '',
                'סכום חיוב (הוצאה)': line ? (isDuplicate ? `${line.amount} (העתק)` : line.amount) : '',
                'סכום עסקה (הוצאה)': line?.total_amount || line?.amount || '',
                'פירוט בנק (הוצאה)': line ? (isDuplicate ? `${line.description} (העתק)` : line.description) : '',
                'הערה / סיבת אישור': line?.approval_note || inv.approval_note || '',
                'שם ספק (חשבונית)': inv.supplier_name || '', 'ח.פ/עוסק (חשבונית)': inv.supplier_tax_id || '',
                'מספר חשבונית': inv.invoice_number || '', 'תאריך חשבונית': inv.invoice_date || '',
                'סכום חשבונית': inv.total_amount || '', 'מטבע חשבונית': inv.currency || '',
                'מע״מ (חשבונית)': inv.vat_amount || '', 'קטגוריה': inv.categories?.name || '',
                'סטטוס התאמה': translateStatus(inv.status),
                'קישור לחשבונית': inv.drive_file_url ? { text: 'צפה בחשבונית', hyperlink: inv.drive_file_url } : '',
              });
            });
          }
        }
        
        const excelBuffer = await generateStyledExcel(headers, exportData, 'Invoices');
        sendEvent('log', { message: 'אקסל מוכן. מחלץ קבצי מקור ומייצר PDF...' });
        
        const MAX_CHUNK_SIZE_BYTES = 12 * 1024 * 1024;
        const allUniqueInvoices = Array.from(uniqueInvoicesToMerge.values());
        const invoicesToProcess = allUniqueInvoices.filter((inv: any) => inv.drive_file_id);
        const pdfFiles: { id: string; url: string }[] = [];
        const pdfBuffersList: Buffer[] = [];
        const timestamp = new Date().getTime();
        
        let mergedPdf = await PDFDocument.create();
        let currentChunkSize = 0;
        let chunkIndex = 0;
        let processedCount = 0;
        
        for (const inv of invoicesToProcess) {
          try {
            processedCount++;
            sendEvent('progress', { 
              current: processedCount, 
              total: invoicesToProcess.length, 
              message: `מעבד קובץ ${processedCount} מתוך ${invoicesToProcess.length}...` 
            });
            
            const response = await drive.files.get(
              { fileId: inv.drive_file_id, alt: 'media', supportsAllDrives: true },
              { responseType: 'arraybuffer' }
            );
            const fileBuffer = Buffer.from(response.data as ArrayBuffer);

            if (currentChunkSize + fileBuffer.length > MAX_CHUNK_SIZE_BYTES && currentChunkSize > 0) {
              sendEvent('log', { message: `מפצל PDF - שומר חלק ${chunkIndex + 1} ומעלה לגוגל דרייב...` });
              const mergedPdfBytes = await mergedPdf.save();
              const pdfBuffer = Buffer.from(mergedPdfBytes);
              pdfBuffersList.push(pdfBuffer);
              
              chunkIndex++;
              const pdfFile = await uploadExportToDrive(drive, `Invoices_Export_part${chunkIndex}_${timestamp}.pdf`, pdfBuffer, 'application/pdf');
              pdfFiles.push(pdfFile);
              
              mergedPdf = await PDFDocument.create();
              currentChunkSize = 0;
            }

            currentChunkSize += fileBuffer.length;
            const headerText = fileBuffer.toString('ascii', 0, Math.min(1024, fileBuffer.length));
            const isPDF = headerText.includes('%PDF');
            
            if (isPDF) {
              const donorPdf = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
              const copiedPages = await mergedPdf.copyPages(donorPdf, donorPdf.getPageIndices());
              copiedPages.forEach(page => mergedPdf.addPage(page));
            } else {
              try {
                let img;
                if (inv.original_filename?.toLowerCase().endsWith('.png')) {
                  img = await mergedPdf.embedPng(fileBuffer);
                } else {
                  img = await mergedPdf.embedJpg(fileBuffer);
                }
                const { width, height } = img.scale(1);
                const page = mergedPdf.addPage([width, height]);
                page.drawImage(img, { x: 0, y: 0, width, height });
              } catch (fallbackError) {
                console.error(`Fallback embed failed for file ${inv.drive_file_id}:`, fallbackError);
              }
            }
          } catch (e) {
            console.error(`Failed to process file ${inv.drive_file_id}:`, e);
          }
        }
          
        sendEvent('log', { message: 'סיים לעבד קבצים, מכין מסמך PDF סופי...' });
        if (currentChunkSize > 0 || chunkIndex === 0) {
          const mergedPdfBytes = await mergedPdf.save();
          const pdfBuffer = Buffer.from(mergedPdfBytes);
          pdfBuffersList.push(pdfBuffer);
          
          chunkIndex++;
          const pdfFile = await uploadExportToDrive(drive, `Invoices_Export_part${chunkIndex}_${timestamp}.pdf`, pdfBuffer, 'application/pdf');
          pdfFiles.push(pdfFile);
        }

        sendEvent('log', { message: 'מעלה קובץ אקסל לגוגל דרייב...' });
        const excelFile = await uploadExportToDrive(drive, `Invoices_Export_${timestamp}.xlsx`, excelBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        sendEvent('log', { message: 'אורז את כל הקבצים לקובץ ZIP אחד לנוחיות...' });
        const zip = new JSZip();
        zip.file(`Invoices_Export_${timestamp}.xlsx`, excelBuffer);
        pdfBuffersList.forEach((buf, idx) => {
          zip.file(`Invoices_Export_part${idx + 1}_${timestamp}.pdf`, buf);
        });
        
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
        const zipFile = await uploadExportToDrive(drive, `Export_All_Pending_${timestamp}.zip`, zipBuffer, 'application/zip');

        sendEvent('log', { message: 'פעולת ההכנה הסתיימה בהצלחה!' });
        sendEvent('complete', {
          success: true,
          count: allUniqueInvoices.length,
          invoiceIds: allUniqueInvoices.map(i => i.id),
          excel: excelFile,
          pdfFiles: pdfFiles,
          zip: zipFile
        });

      } catch (error: any) {
        console.error('Export prepare error:', error);
        let errorMessage = 'שגיאת שרת לא ידועה';
        if (error && typeof error === 'object' && error.message) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        }
        sendEvent('error', { error: errorMessage });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
