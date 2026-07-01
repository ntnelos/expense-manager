import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { uploadToGoogleDrive, deleteFromGoogleDrive } from '@/lib/google/drive';
import { extractInvoiceFromImage, extractInvoiceFromPDF } from '@/lib/ocr/extract';
import { generateSHA256Hash } from '@/lib/utils/hash';

export async function POST(request: Request) {
  let uploadedFileId: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const source = (formData.get('source') as string) || 'manual_upload';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // 1. Read file into buffer and compute hash
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentHash = generateSHA256Hash(buffer);

    const supabase = createServerClient();

    // 2. Check for duplicate content_hash in DB
    const { data: existingInvoice, error: checkError } = await supabase
      .from('invoices')
      .select('id, supplier_name, total_amount, invoice_date, drive_file_url')
      .eq('content_hash', contentHash)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking duplicate invoice in DB:', checkError);
    }

    if (existingInvoice) {
      return NextResponse.json(
        {
          error: 'Duplicate file detected.',
          code: 'DUPLICATE_INVOICE',
          invoice: existingInvoice,
        },
        { status: 409 }
      );
    }

    // 3. Upload to Google Drive
    const uploadResult = await uploadToGoogleDrive(
      buffer,
      file.name,
      file.type,
      new Date()
    );
    uploadedFileId = uploadResult.fileId;

    // 4. Run OCR extraction based on file type
    let ocrResult;
    if (file.type === 'application/pdf') {
      ocrResult = await extractInvoiceFromPDF(buffer);
    } else if (file.type.startsWith('image/')) {
      ocrResult = await extractInvoiceFromImage(buffer, file.type);
    } else {
      // Clean up Drive file before returning error
      await deleteFromGoogleDrive(uploadedFileId);
      return NextResponse.json(
        { error: 'Unsupported file type. Only PDF and image files are supported.' },
        { status: 400 }
      );
    }

    // 5. Handle credit notes (ignore and delete from Drive)
    if (ocrResult.is_credit_note) {
      await deleteFromGoogleDrive(uploadedFileId);
      return NextResponse.json(
        {
          message: 'Credit note/refund document detected and skipped.',
          code: 'CREDIT_NOTE_IGNORED',
          ocr: ocrResult,
        },
        { status: 200 } // Status 200 is fine as it's a successful ignore workflow
      );
    }

    // 6. Save invoice metadata to Supabase DB
    const { data: newInvoice, error: insertError } = await supabase
      .from('invoices')
      .insert({
        content_hash: contentHash,
        drive_file_id: uploadResult.fileId,
        drive_file_url: uploadResult.fileUrl,
        original_filename: file.name,
        source: source,
        supplier_name: ocrResult.supplier_name,
        supplier_tax_id: ocrResult.supplier_tax_id,
        invoice_date: ocrResult.invoice_date,
        total_amount: ocrResult.total_amount,
        vat_amount: ocrResult.vat_amount,
        document_type: ocrResult.document_type,
        status: 'new',
        raw_ocr_data: ocrResult as any,
        ocr_verified: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting invoice into Supabase:', insertError);
      // Clean up Drive file
      await deleteFromGoogleDrive(uploadedFileId);
      return NextResponse.json(
        { error: 'Failed to save invoice record in database.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      invoice: newInvoice,
    });
  } catch (error: any) {
    console.error('Invoice upload/processing error:', error);
    
    // Attempt cleanup if file was uploaded but DB save or OCR failed
    if (uploadedFileId) {
      try {
        await deleteFromGoogleDrive(uploadedFileId);
      } catch (cleanupError) {
        console.error('Failed to clean up Google Drive file after error:', cleanupError);
      }
    }

    return NextResponse.json(
      { error: error.message || 'An error occurred during file upload and OCR processing.' },
      { status: 500 }
    );
  }
}
