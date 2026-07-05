-- Expense Manager: Add currency and original_amount to invoices
-- Migration: 006_invoice_currency.sql

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'ILS';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS original_amount NUMERIC;
