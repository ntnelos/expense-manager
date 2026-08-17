-- Migration: card_charge_dates table
-- Stores the charge day-of-month per credit card (last 4 digits)

CREATE TABLE IF NOT EXISTS card_charge_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_last_digits TEXT UNIQUE NOT NULL,
  charge_day INTEGER NOT NULL CHECK (charge_day >= 1 AND charge_day <= 31),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER tr_card_charge_dates_updated_at
  BEFORE UPDATE ON card_charge_dates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE card_charge_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access" ON card_charge_dates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access" ON card_charge_dates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Default values
INSERT INTO card_charge_dates (card_last_digits, charge_day) VALUES
  ('0493', 15),
  ('6498', 10)
ON CONFLICT (card_last_digits) DO NOTHING;

-- Fix existing data from Aug 13 with null charge_date
UPDATE expense_lines
SET charge_date = '2026-08-15'
WHERE charge_date IS NULL
  AND card_last_digits = '0493'
  AND created_at::date = '2026-08-13';

UPDATE expense_lines
SET charge_date = '2026-08-10'
WHERE charge_date IS NULL
  AND card_last_digits = '6498'
  AND created_at::date = '2026-08-13';
