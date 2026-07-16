-- ============================================
-- Migration: 010_supplier_aliases.sql
-- Adds supplier_aliases table for smart renaming
-- ============================================

CREATE TABLE IF NOT EXISTS supplier_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name TEXT NOT NULL,
  alias_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for searching aliases
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_aliases_original_name ON supplier_aliases (LOWER(original_name));

-- RLS policies
ALTER TABLE supplier_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access" ON supplier_aliases
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access" ON supplier_aliases
  FOR ALL TO service_role USING (true) WITH CHECK (true);
