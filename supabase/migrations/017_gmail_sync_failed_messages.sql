-- Migration: 017_gmail_sync_failed_messages.sql
-- Description: Retry queue for Gmail messages that failed processing (OCR / Drive / DB errors),
-- so the sync checkpoint can move forward without permanently losing them.

CREATE TABLE IF NOT EXISTS gmail_sync_failed_messages (
  message_id TEXT PRIMARY KEY,          -- Gmail message id
  subject TEXT,
  attempts INT NOT NULL DEFAULT 1,      -- retried automatically while attempts < 3
  last_error TEXT,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gmail_sync_failed_messages_first_failed_at
  ON gmail_sync_failed_messages (first_failed_at);

-- Row Level Security
ALTER TABLE gmail_sync_failed_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to gmail_sync_failed_messages" ON gmail_sync_failed_messages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access to gmail_sync_failed_messages" ON gmail_sync_failed_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
