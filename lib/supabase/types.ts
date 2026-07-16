/* ============================================
   Database Types — Expense Manager
   ============================================ */

export interface Invoice {
  id: string;
  content_hash: string;
  drive_file_id: string;
  drive_file_url: string;
  original_filename: string | null;
  source: 'email' | 'telegram' | 'manual_upload';
  supplier_name: string | null;
  supplier_tax_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null; // ISO date string
  currency: string | null;
  original_amount: number | null;
  total_amount: number | null;
  vat_amount: number | null;
  matched_amount: number;
  document_type: 'tax_invoice' | 'receipt' | 'tax_invoice_receipt' | 'other' | null;
  status: 'new' | 'processing' | 'partially_matched' | 'fully_matched' | 'error';
  raw_ocr_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseLine {
  id: string;
  content_hash: string | null;
  transaction_date: string; // ISO date string
  charge_date: string | null;
  amount: number;
  total_amount: number | null;
  installment_current: number | null;
  installment_total: number | null;
  description: string | null;
  card_last_digits: string | null;
  source_identifier: string | null;
  original_category: string | null;
  currency: string;
  status: 'unapproved' | 'approved' | 'approved_no_invoice';
  approval_note: string | null;
  source_file: string | null;
  created_at: string;
  updated_at: string;
}

export interface Match {
  id: string;
  invoice_id: string;
  expense_line_id: string;
  matched_amount: number;
  match_type: 'auto_exact' | 'auto_tolerance' | 'manual';
  confidence_score: number | null;
  matched_by: string;
  notes: string | null;
  created_at: string;
}

export interface ColumnMapping {
  id: string;
  mapping_name: string;
  header_pattern: string[] | null;
  column_map: Record<string, string>;
  is_active: boolean;
  created_at: string;
}

export interface TelegramUser {
  id: string;
  telegram_user_id: number;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SupplierAlias {
  id: string;
  original_name: string;
  alias_name: string;
  created_at: string;
}

// ---- Derived / UI Types ----

export interface MatchWithRelations extends Match {
  invoice?: Invoice;
  expense_line?: ExpenseLine;
}

export interface InvoiceWithMatches extends Invoice {
  matches?: MatchWithRelations[];
}

export interface ExpenseLineWithMatch extends ExpenseLine {
  match?: MatchWithRelations;
}

export type InvoiceStatus = Invoice['status'];
export type ExpenseLineStatus = ExpenseLine['status'];
export type MatchType = Match['match_type'];
export type DocumentType = NonNullable<Invoice['document_type']>;
export type InvoiceSource = Invoice['source'];

// ---- Dashboard Stats ----

export interface DashboardStats {
  totalInvoices: number;
  unmatchedInvoices: number;
  totalExpenseLines: number;
  unapprovedExpenseLines: number;
  matchRate: number; // 0-100
  totalMatchedAmount: number;
}
