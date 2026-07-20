-- Add download_count column to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS download_count INT NOT NULL DEFAULT 0;
