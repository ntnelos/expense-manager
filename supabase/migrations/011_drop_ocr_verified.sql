-- Drop the ocr_verified column since we no longer use manual verification
ALTER TABLE invoices DROP COLUMN IF EXISTS ocr_verified;
