-- Migration: Add sent_to_accountant boolean to invoices

ALTER TABLE public.invoices
ADD COLUMN sent_to_accountant boolean DEFAULT false;

-- Add index to improve performance on filtering tabs
CREATE INDEX IF NOT EXISTS idx_invoices_sent_to_accountant ON public.invoices(sent_to_accountant);
