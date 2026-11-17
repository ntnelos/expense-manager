// Shared by the duplicate-check / upload API routes and the uploader UI. No server-only imports here.

/** Columns returned for an existing invoice when an upload is flagged as a duplicate. */
export const DUPLICATE_INVOICE_FIELDS =
  'id, supplier_name, invoice_number, invoice_date, total_amount, currency, original_amount, drive_file_url, created_at';

export interface DuplicateInvoiceSummary {
  id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  currency: string | null;
  original_amount: number | null;
  drive_file_url: string | null;
  created_at: string;
}

/**
 * - identical_file: byte-for-byte the same file (content_hash). Can't be uploaded again.
 * - same_invoice_number: a different file whose OCR found the same supplier + invoice number.
 *   May be a false positive (misread number), so the user can upload it anyway.
 */
export type DuplicateType = 'identical_file' | 'same_invoice_number';

export interface DuplicateInfo {
  type: DuplicateType;
  existing: DuplicateInvoiceSummary;
  extracted?: {
    supplier_name: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    total_amount: number | null;
  };
}
