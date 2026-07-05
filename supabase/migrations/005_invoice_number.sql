-- Expense Manager: Add invoice_number column
-- Migration: 005_invoice_number.sql

-- Add invoice_number to invoices table for semantic deduplication
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;

-- Create an index to speed up duplication checks
CREATE INDEX IF NOT EXISTS idx_invoices_supplier_number ON invoices (supplier_name, invoice_number);
