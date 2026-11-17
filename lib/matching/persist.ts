import { moveInvoiceDriveStatus } from '@/lib/google/drive';

type Supabase = any; // the project's server client is untyped

// Fixes the DB trigger for negative amounts (credit notes): recomputes the invoice status from matched_amount.
export async function recalculateInvoiceStatus(supabase: Supabase, invoiceId: string) {
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

export interface CreateMatchInput {
  invoice_id: string;
  expense_line_id: string;
  matched_amount: number;
  match_type: 'manual' | 'auto_exact' | 'auto_tolerance';
  matched_by?: string;
  confidence_score?: number | null;
  notes?: string | null;
}

/**
 * Inserts a match and applies the side effects every match needs: status recalculation (DB triggers
 * handle the rest) and moving the invoice file to the "matched" Drive folder.
 * Returns { error: 'duplicate' } when this pair already exists.
 */
export async function createMatch(supabase: Supabase, input: CreateMatchInput) {
  const { data, error } = await supabase
    .from('matches')
    .insert({
      invoice_id: input.invoice_id,
      expense_line_id: input.expense_line_id,
      matched_amount: input.matched_amount,
      match_type: input.match_type,
      matched_by: input.matched_by || 'system',
      confidence_score: input.confidence_score ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return { match: null, error: 'duplicate' as const };
    throw error;
  }

  const invoice = await recalculateInvoiceStatus(supabase, input.invoice_id);
  if (invoice?.drive_file_id && invoice.status !== 'new') {
    const dateToUse = invoice.invoice_date ? new Date(invoice.invoice_date) : new Date();
    moveInvoiceDriveStatus(invoice.drive_file_id, dateToUse, 'matched').catch(console.error);
  }

  return { match: data, error: null };
}
