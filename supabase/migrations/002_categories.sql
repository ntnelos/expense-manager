-- ============================================
-- Migration: 002_categories.sql
-- Adds invoice categories system
-- ============================================

-- 1. Categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  icon TEXT DEFAULT '📁',
  color TEXT DEFAULT '#6366f1',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add category_id column to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_category ON invoices (category_id);

-- 3. RLS policies for categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access" ON categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access" ON categories
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Seed default categories
INSERT INTO categories (name, icon, color, sort_order) VALUES
  ('דלק', '⛽', '#ef4444', 1),
  ('מזון ומשקאות', '🍔', '#f97316', 2),
  ('שירותי ענן', '☁️', '#3b82f6', 3),
  ('ציוד משרדי', '🖨️', '#8b5cf6', 4),
  ('נסיעות', '✈️', '#06b6d4', 5),
  ('שירותים מקצועיים', '👔', '#10b981', 6),
  ('תקשורת', '📱', '#ec4899', 7),
  ('ביטוח', '🛡️', '#f59e0b', 8),
  ('השכרה ונדל"ן', '🏢', '#14b8a6', 9),
  ('אחר', '📁', '#6b7280', 10)
ON CONFLICT (name) DO NOTHING;
