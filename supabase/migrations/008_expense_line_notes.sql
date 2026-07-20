-- Add notes column to expense_lines for user annotations
ALTER TABLE expense_lines ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL;
