-- Migration: 016_gmail_sync_auto_scan_day.sql
-- Description: Add auto_scan_day_of_month to gmail_sync_config

ALTER TABLE gmail_sync_config 
ADD COLUMN IF NOT EXISTS auto_scan_day_of_month INTEGER DEFAULT 1;
