-- Add columns for Israeli bank exports (Total Amount and Installment parsing)
ALTER TABLE expense_lines ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2);
ALTER TABLE expense_lines ADD COLUMN IF NOT EXISTS installment_current INTEGER;
ALTER TABLE expense_lines ADD COLUMN IF NOT EXISTS installment_total INTEGER;
