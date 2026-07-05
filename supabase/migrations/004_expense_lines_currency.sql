-- Add currency column to handle foreign transactions
ALTER TABLE expense_lines ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'ILS';
