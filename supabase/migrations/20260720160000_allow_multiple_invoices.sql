-- Migration to allow multiple invoices per expense line
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_expense_line_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_unique_pair ON matches(invoice_id, expense_line_id);
