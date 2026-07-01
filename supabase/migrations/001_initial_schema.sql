-- Expense Manager: Initial Database Schema
-- Migration: 001_initial_schema.sql

-- ============================================
-- 1. INVOICES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT UNIQUE NOT NULL,
  drive_file_id TEXT NOT NULL,
  drive_file_url TEXT NOT NULL,
  original_filename TEXT,
  source TEXT NOT NULL CHECK (source IN ('email', 'telegram', 'manual_upload')),
  supplier_name TEXT,
  supplier_tax_id TEXT,
  invoice_date DATE,
  total_amount NUMERIC(12, 2),
  vat_amount NUMERIC(12, 2),
  matched_amount NUMERIC(12, 2) DEFAULT 0,
  document_type TEXT CHECK (document_type IN ('tax_invoice', 'receipt', 'tax_invoice_receipt', 'other')),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'processing', 'partially_matched', 'fully_matched', 'error')),
  raw_ocr_data JSONB,
  ocr_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for deduplication lookups
CREATE INDEX IF NOT EXISTS idx_invoices_content_hash ON invoices (content_hash);

-- Index for matching engine queries (status + date + amount)
CREATE INDEX IF NOT EXISTS idx_invoices_matching ON invoices (status, invoice_date, total_amount);

-- Index for grid filtering
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices (invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices (supplier_name);

-- ============================================
-- 2. EXPENSE LINES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS expense_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT UNIQUE,
  transaction_date DATE NOT NULL,
  charge_date DATE,
  amount NUMERIC(12, 2) NOT NULL,
  description TEXT,
  card_last_digits TEXT,
  source_identifier TEXT,
  original_category TEXT,
  status TEXT DEFAULT 'unapproved' CHECK (status IN ('unapproved', 'approved', 'approved_no_invoice')),
  approval_note TEXT,
  source_file TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for deduplication
CREATE INDEX IF NOT EXISTS idx_expense_lines_content_hash ON expense_lines (content_hash);

-- Index for matching engine queries (status + date + amount)
CREATE INDEX IF NOT EXISTS idx_expense_lines_matching ON expense_lines (status, transaction_date, amount);

-- Index for grid filtering
CREATE INDEX IF NOT EXISTS idx_expense_lines_date ON expense_lines (transaction_date DESC);

-- ============================================
-- 3. MATCHES TABLE (1:N - one invoice to many expense lines)
-- ============================================
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  expense_line_id UUID NOT NULL UNIQUE REFERENCES expense_lines(id) ON DELETE CASCADE,
  matched_amount NUMERIC(12, 2) NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('auto_exact', 'auto_tolerance', 'manual')),
  confidence_score NUMERIC(5, 2),
  matched_by TEXT DEFAULT 'system',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for looking up matches by invoice (1:N)
CREATE INDEX IF NOT EXISTS idx_matches_invoice_id ON matches (invoice_id);

-- expense_line_id already has UNIQUE constraint (acts as index)

-- ============================================
-- 4. COLUMN MAPPINGS TABLE (saved CSV/Excel import configurations)
-- ============================================
CREATE TABLE IF NOT EXISTS column_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_name TEXT UNIQUE NOT NULL,
  header_pattern JSONB,
  column_map JSONB NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 5. TELEGRAM USERS TABLE (whitelist for bot auth)
-- ============================================
CREATE TABLE IF NOT EXISTS telegram_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT UNIQUE NOT NULL,
  display_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 6. AUTO-UPDATE updated_at TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tr_expense_lines_updated_at
  BEFORE UPDATE ON expense_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. TRIGGER: Auto-update invoice matched_amount & status on match changes
-- ============================================
CREATE OR REPLACE FUNCTION update_invoice_matched_amount()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id UUID;
  v_total NUMERIC(12, 2);
  v_matched NUMERIC(12, 2);
  v_invoice_total NUMERIC(12, 2);
BEGIN
  -- Determine which invoice to update
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;

  -- Calculate total matched amount for this invoice
  SELECT COALESCE(SUM(m.matched_amount), 0) INTO v_matched
  FROM matches m
  WHERE m.invoice_id = v_invoice_id;

  -- Get invoice total_amount
  SELECT total_amount INTO v_invoice_total
  FROM invoices
  WHERE id = v_invoice_id;

  -- Update invoice matched_amount and status
  UPDATE invoices
  SET
    matched_amount = v_matched,
    status = CASE
      WHEN v_matched <= 0 THEN 'new'
      WHEN v_matched >= v_invoice_total THEN 'fully_matched'
      ELSE 'partially_matched'
    END
  WHERE id = v_invoice_id;

  -- If DELETE, also handle the old invoice if invoice_id changed (shouldn't happen normally)
  IF TG_OP = 'UPDATE' AND OLD.invoice_id <> NEW.invoice_id THEN
    SELECT COALESCE(SUM(m.matched_amount), 0) INTO v_matched
    FROM matches m
    WHERE m.invoice_id = OLD.invoice_id;

    SELECT total_amount INTO v_invoice_total
    FROM invoices
    WHERE id = OLD.invoice_id;

    UPDATE invoices
    SET
      matched_amount = v_matched,
      status = CASE
        WHEN v_matched <= 0 THEN 'new'
        WHEN v_matched >= v_invoice_total THEN 'fully_matched'
        ELSE 'partially_matched'
      END
    WHERE id = OLD.invoice_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_matches_update_invoice
  AFTER INSERT OR UPDATE OR DELETE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_matched_amount();

-- ============================================
-- 8. TRIGGER: Auto-update expense_line status on match changes
-- ============================================
CREATE OR REPLACE FUNCTION update_expense_line_status_on_match()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE expense_lines
    SET status = 'approved'
    WHERE id = NEW.expense_line_id AND status = 'unapproved';
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE expense_lines
    SET status = 'unapproved'
    WHERE id = OLD.expense_line_id AND status = 'approved';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_matches_update_expense_line
  AFTER INSERT OR UPDATE OR DELETE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION update_expense_line_status_on_match();

-- ============================================
-- 9. ROW LEVEL SECURITY (single-user for now)
-- ============================================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE column_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_users ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (single-user system)
CREATE POLICY "Allow authenticated full access" ON invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON expense_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON matches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON column_mappings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated full access" ON telegram_users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow service role full access (for API routes, cron jobs, etc.)
CREATE POLICY "Allow service role full access" ON invoices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access" ON expense_lines
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access" ON matches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access" ON column_mappings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access" ON telegram_users
  FOR ALL TO service_role USING (true) WITH CHECK (true);
