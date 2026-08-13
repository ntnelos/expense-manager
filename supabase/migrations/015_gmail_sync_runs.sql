-- Migration: 015_gmail_sync_runs.sql
-- Description: Create table for tracking Gmail sync executions, real-time progress, and logs

CREATE TABLE IF NOT EXISTS gmail_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'cron'
  status TEXT NOT NULL DEFAULT 'running',      -- 'running' | 'completed' | 'failed'
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  total_messages INT DEFAULT 0,
  processed_messages INT DEFAULT 0,
  new_invoices_count INT DEFAULT 0,
  current_step TEXT,
  logs JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fetching latest runs quickly
CREATE INDEX IF NOT EXISTS idx_gmail_sync_runs_started_at ON gmail_sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmail_sync_runs_status ON gmail_sync_runs (status);

-- Row Level Security
ALTER TABLE gmail_sync_runs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "Allow authenticated full access to gmail_sync_runs" ON gmail_sync_runs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access to gmail_sync_runs" ON gmail_sync_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
