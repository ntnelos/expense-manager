-- Migration: 008_gmail_sync.sql
-- Description: Create table for storing Gmail sync configuration and checkpoint

CREATE TABLE IF NOT EXISTS gmail_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address TEXT UNIQUE NOT NULL,
  refresh_token TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security
ALTER TABLE gmail_sync_config ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (single-user system)
CREATE POLICY "Allow authenticated full access" ON gmail_sync_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow service role full access (for API routes, cron jobs, etc.)
CREATE POLICY "Allow service role full access" ON gmail_sync_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trigger for updated_at (reuses the function created in 001_initial_schema.sql)
CREATE TRIGGER tr_gmail_sync_config_updated_at
  BEFORE UPDATE ON gmail_sync_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
