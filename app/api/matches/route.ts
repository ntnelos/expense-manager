import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { moveInvoiceDriveStatus } from '@/lib/google/drive';

export async function GET(req: Request) {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('matches')
      .select('*, invoice:invoices(*), expense_line:expense_lines(*)')
      .order('created_at', { ascending: false });

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

    // Move file in Google Drive to "matched" folder
    const { data: invoice } = await supabase
      .from('invoices')
      .select('drive_file_id, invoice_date')
      .eq('id', invoice_id)
      .single();
      
    if (invoice?.drive_file_id) {
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

    // Move file in Google Drive back to "not_matched" folder
    if (match?.invoice_id) {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('drive_file_id, invoice_date')
        .eq('id', match.invoice_id)
        .single();
        
      if (invoice?.drive_file_id) {
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
