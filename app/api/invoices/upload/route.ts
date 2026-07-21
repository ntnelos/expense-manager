import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { uploadToGoogleDrive, deleteFromGoogleDrive } from '@/lib/google/drive';
import { extractInvoiceFromImage, extractInvoiceFromPDF } from '@/lib/ocr/extract';
import { generateSHA256Hash } from '@/lib/utils/hash';
import { applySupplierAlias } from '@/lib/utils/alias';

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

    // 3. Run OCR extraction based on file type
    let ocrResult: any;
    let hasOcrError = false;
    let ocrErrorMessage = '';

    try {
      if (file.type === 'application/pdf') {
        ocrResult = await extractInvoiceFromPDF(buffer);
      } else if (file.type.startsWith('image/')) {
        ocrResult = await extractInvoiceFromImage(buffer, file.type);
      } else {
        return NextResponse.json(
          { error: 'Unsupported file type for OCR.' },
          { status: 400 }
        );
      }
    } catch (err: any) {
      console.error('OCR Extraction failed:', err);
      hasOcrError = true;
      ocrErrorMessage = err.message || 'Unknown OCR error';
      // Provide fallback data so upload flow can continue
      ocrResult = {
        supplier_name: 'חשבונית לא מזוהה', // Unidentified Invoice
        supplier_tax_id: null,
        invoice_number: null,
        invoice_date: null,
        currency: 'ILS',
        total_amount: null,
        vat_amount: null,
        document_type: 'other',
        is_credit_note: false,
        suggested_category: null
      };
    }

    // 3.2 Apply Smart Supplier Alias Translation
    if (!hasOcrError && ocrResult.supplier_name) {
      ocrResult.supplier_name = await applySupplierAlias(ocrResult.supplier_name);
    }

    // 3.5 Handle Foreign Currency Conversion
    let finalTotalAmount = ocrResult.total_amount;
    let originalAmount = null;
    let invoiceCurrency = ocrResult.currency || 'ILS';
    
    if (invoiceCurrency !== 'ILS' && ocrResult.total_amount && ocrResult.invoice_date) {
      try {
        const response = await fetch(`https://api.frankfurter.dev/v1/${ocrResult.invoice_date}?base=${invoiceCurrency}&symbols=ILS`);
        if (response.ok) {
          const data = await response.json();
          if (data.rates && data.rates.ILS) {
            originalAmount = ocrResult.total_amount;
            finalTotalAmount = Math.round(originalAmount * data.rates.ILS * 100) / 100;
          }
        } else {
          // Fallback to latest if historical fails
          const latestResponse = await fetch(`https://api.frankfurter.dev/v1/latest?base=${invoiceCurrency}&symbols=ILS`);
          if (latestResponse.ok) {
            const data = await latestResponse.json();
            if (data.rates && data.rates.ILS) {
              originalAmount = ocrResult.total_amount;
              finalTotalAmount = Math.round(originalAmount * data.rates.ILS * 100) / 100;
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch exchange rate:', err);
      }
    }

    // 4. Handle credit notes (make amounts negative)
    if (!hasOcrError && ocrResult.is_credit_note) {
      if (finalTotalAmount !== null) finalTotalAmount = -Math.abs(finalTotalAmount);
      if (originalAmount !== null) originalAmount = -Math.abs(originalAmount);
    }
    // 5. Upload file to Google Drive with smart renaming
    const extension = file.name.split('.').pop() || 'pdf';
    const supplier = hasOcrError ? 'Unidentified' : (ocrResult.supplier_name ? ocrResult.supplier_name.replace(/[/\\?%*:|"<>]/g, '') : 'Unknown');
    const invoiceDate = ocrResult.invoice_date || new Date().toISOString().split('T')[0];
    const newFilename = `${supplier} - ${invoiceDate}.${extension}`;

    let uploadResult: { fileId: string; fileUrl: string };
    try {
      const driveStatus = hasOcrError ? 'error' : 'not_matched';
      const driveDate = ocrResult.invoice_date ? new Date(ocrResult.invoice_date) : new Date();
      uploadResult = await uploadToGoogleDrive(buffer, newFilename, file.type, driveDate, driveStatus);
      uploadedFileId = uploadResult.fileId;
    } catch (uploadError) {
      throw new Error('Failed to upload to Google Drive: ' + (uploadError as Error).message);
    }

    // 5.5 Auto-assign category based on previous vendor history, or fallback to AI suggestion
    let categoryId: string | null = null;
    
    if (!hasOcrError && ocrResult.supplier_name) {
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

    // 5.8 Semantic Duplicate Check (By Supplier + Invoice Number)
    if (!hasOcrError && ocrResult.supplier_name && ocrResult.invoice_number) {
      const { data: semanticDuplicates } = await supabase
        .from('invoices')
        .select('id, supplier_name, invoice_number, invoice_date, total_amount')
        .eq('supplier_name', ocrResult.supplier_name)
        .eq('invoice_number', ocrResult.invoice_number);

      if (semanticDuplicates && semanticDuplicates.length > 0) {
        const newSign = (finalTotalAmount || 0) < 0 ? -1 : 1;
        const isDuplicate = semanticDuplicates.some(dup => {
          const dupSign = (dup.total_amount || 0) < 0 ? -1 : 1;
          return newSign === dupSign;
        });

        if (isDuplicate) {
          if (uploadedFileId) await deleteFromGoogleDrive(uploadedFileId);
          return NextResponse.json(
            {
              error: 'Duplicate invoice detected (same supplier and invoice number).',
              code: 'DUPLICATE_INVOICE',
              invoice: semanticDuplicates[0],
            },
            { status: 409 }
          );
        }
      }
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
        invoice_number: ocrResult.invoice_number,
        invoice_date: ocrResult.invoice_date,
        currency: invoiceCurrency,
        original_amount: originalAmount,
        total_amount: finalTotalAmount,
        vat_amount: ocrResult.vat_amount,
        document_type: ocrResult.document_type,
        category_id: categoryId,
        status: hasOcrError ? 'error' : 'new',
        raw_ocr_data: hasOcrError ? { error: ocrErrorMessage } : (ocrResult as any),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting invoice into Supabase:', insertError);
      if (uploadedFileId) await deleteFromGoogleDrive(uploadedFileId); // Rollback
      return NextResponse.json(
        { error: 'Failed to save invoice record in database.', details: insertError },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: hasOcrError ? 'Invoice saved with missing details (OCR failed).' : 'Invoice uploaded successfully',
      invoice: newInvoice,
      isUnidentified: hasOcrError
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

    let errorMessage = error.message || 'An error occurred during file upload and OCR processing.';
    if (errorMessage.includes('fetch failed') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout')) {
      errorMessage = 'החיבור לשרת ה-AI התנתק או לקח זמן רב מדי. אנא נסה להעלות שוב.';
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
