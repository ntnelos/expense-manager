import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { moveInvoiceDriveStatus } from '@/lib/google/drive';

// Helper to fix trigger issues with negative amounts (credit notes)
async function recalculateInvoiceStatus(supabase: any, invoiceId: string) {
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, total_amount, matched_amount, status, drive_file_id, invoice_date')
    .eq('id', invoiceId)
    .single();

  if (!invoice) return null;

  let newStatus = 'new';
  const v_matched = invoice.matched_amount || 0;
  const v_invoice_total = invoice.total_amount || 0;

  if (v_matched === 0) {
    newStatus = 'new';
  } else if (Math.abs(v_matched) >= Math.abs(v_invoice_total)) {
    newStatus = 'fully_matched';
  } else {
    newStatus = 'partially_matched';
  }

  if (newStatus !== invoice.status) {
    await supabase
      .from('invoices')
      .update({ status: newStatus })
      .eq('id', invoiceId);
    invoice.status = newStatus;
  }
  
  return invoice;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get('invoiceId');

    const supabase = createServerClient();
    let query = supabase
      .from('matches')
      .select('*, invoice:invoices(*), expense_line:expense_lines(*)')
      .order('created_at', { ascending: false });

    if (invoiceId) {
      query = query.eq('invoice_id', invoiceId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json({ matches: data || [] });
  } catch (err: any) {
    console.error('GET matches error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { invoice_id, expense_line_id, matched_amount, match_type, notes } = body;

    if (!invoice_id || !expense_line_id || !matched_amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServerClient();

    // The database has triggers that will automatically update the status of the invoice and expense_line
    // when a match is inserted. See 001_initial_schema.sql for the trigger definitions.
    const { data, error } = await supabase
      .from('matches')
      .insert({
        invoice_id,
        expense_line_id,
        matched_amount,
        match_type: match_type || 'manual',
        matched_by: 'system', // Ideally we'd use the user ID if auth was set up
        notes,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This expense line is already matched' }, { status: 409 });
      }
      throw error;
    }

    // Fix DB trigger bug for negative amounts and move file
    const invoice = await recalculateInvoiceStatus(supabase, invoice_id);
      
    if (invoice?.drive_file_id && invoice.status !== 'new') {
      const dateToUse = invoice.invoice_date ? new Date(invoice.invoice_date) : new Date();
      moveInvoiceDriveStatus(invoice.drive_file_id, dateToUse, 'matched').catch(console.error);
    }

    return NextResponse.json({ success: true, match: data });
  } catch (err: any) {
    console.error('POST match error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'Missing match ID' }, { status: 400 });

    const supabase = createServerClient();
    
    // Fetch the match to get the invoice_id before deleting
    const { data: match } = await supabase
      .from('matches')
      .select('invoice_id')
      .eq('id', id)
      .single();

    // The database trigger will automatically update the statuses of the invoice and expense_line
    // when the match is deleted.
    const { error } = await supabase
      .from('matches')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Move file in Google Drive back to "not_matched" folder ONLY if the invoice has no other matches
    if (match?.invoice_id) {
      const invoice = await recalculateInvoiceStatus(supabase, match.invoice_id);
        
      if (invoice?.drive_file_id && invoice.status === 'new') {
        const dateToUse = invoice.invoice_date ? new Date(invoice.invoice_date) : new Date();
        moveInvoiceDriveStatus(invoice.drive_file_id, dateToUse, 'not_matched').catch(console.error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE match error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
