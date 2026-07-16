-- Migration: 009_gmail_sync_service_account.sql
-- Description: Drop NOT NULL constraint on refresh_token since we are migrating to Service Account

ALTER TABLE gmail_sync_config 
  ALTER COLUMN refresh_token DROP NOT NULL;
