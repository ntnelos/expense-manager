import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { renameGoogleDriveFile, moveInvoiceDriveStatus } from '@/lib/google/drive';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = createServerClient();
    const resolvedParams = await params;
    const id = resolvedParams.id;
    const updates = await req.json();

    // 1. Fetch current invoice to get drive_file_id
    const { data: currentInvoice, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // 2. Build update object
    const updatePayload: any = {
      supplier_name: updates.supplier_name !== undefined ? updates.supplier_name : currentInvoice.supplier_name,
      invoice_number: updates.invoice_number !== undefined ? updates.invoice_number : currentInvoice.invoice_number,
      invoice_date: updates.invoice_date !== undefined ? updates.invoice_date : currentInvoice.invoice_date,
      total_amount: updates.total_amount !== undefined ? updates.total_amount : currentInvoice.total_amount,
      currency: updates.currency !== undefined ? updates.currency : currentInvoice.currency,
      original_amount: updates.original_amount !== undefined ? updates.original_amount : currentInvoice.original_amount,
      vat_amount: updates.vat_amount !== undefined ? updates.vat_amount : currentInvoice.vat_amount,
      category_id: updates.category_id !== undefined ? updates.category_id : currentInvoice.category_id,
      status: updates.status !== undefined ? updates.status : currentInvoice.status,
      approval_note: updates.approval_note !== undefined ? updates.approval_note : currentInvoice.approval_note,
      rotation_angle: updates.rotation_angle !== undefined ? updates.rotation_angle : currentInvoice.rotation_angle,
    };

    // If it was in error status and now being identified, change status to 'new'
    if (currentInvoice.status === 'error') {
      updatePayload.status = 'new';
    }

    // 3. Update database
    const { data: updatedInvoice, error: updateError } = await supabase
      .from('invoices')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // 4. Update Google Drive if it was an error
    if (currentInvoice.status === 'error' && currentInvoice.drive_file_id) {
      try {
        // Rename file
        const supplier = updatedInvoice.supplier_name ? updatedInvoice.supplier_name.replace(/[/\\?%*:|"<>]/g, '') : 'Unknown';
        const ext = currentInvoice.original_filename?.split('.').pop() || 'pdf';
        const invoiceDate = updatedInvoice.invoice_date || new Date().toISOString().split('T')[0];
        const newFilename = `${supplier} - ${invoiceDate}.${ext}`;
        
        await renameGoogleDriveFile(currentInvoice.drive_file_id, newFilename);

        // Move from error to not_matched
        const dateToUse = updatedInvoice.invoice_date ? new Date(updatedInvoice.invoice_date) : new Date();
        await moveInvoiceDriveStatus(currentInvoice.drive_file_id, dateToUse, 'not_matched');
      } catch (driveErr) {
        console.error('Failed to update Drive for manually identified invoice:', driveErr);
        // We don't fail the request, since DB updated successfully
      }
    }

    return NextResponse.json({ success: true, invoice: updatedInvoice });
  } catch (err: any) {
    console.error('Failed to update invoice:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
