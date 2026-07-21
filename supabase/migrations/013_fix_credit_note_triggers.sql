-- ============================================
-- 7. TRIGGER: Auto-update invoice matched_amount & status on match changes
-- FIXED: Support negative amounts (credit notes)
-- ============================================
CREATE OR REPLACE FUNCTION update_invoice_matched_amount()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id UUID;
  v_total NUMERIC(12, 2);
  v_matched NUMERIC(12, 2);
  v_invoice_total NUMERIC(12, 2);
BEGIN
  -- Determine which invoice to update
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;

  -- Calculate total matched amount for this invoice
  SELECT COALESCE(SUM(m.matched_amount), 0) INTO v_matched
  FROM matches m
  WHERE m.invoice_id = v_invoice_id;

  -- Get invoice total_amount
  SELECT total_amount INTO v_invoice_total
  FROM invoices
  WHERE id = v_invoice_id;

  -- Update invoice matched_amount and status
  UPDATE invoices
  SET
    matched_amount = v_matched,
    status = CASE
      WHEN v_matched = 0 THEN 'new'
      WHEN ABS(v_matched) >= ABS(v_invoice_total) THEN 'fully_matched'
      ELSE 'partially_matched'
    END
  WHERE id = v_invoice_id;

  -- If DELETE, also handle the old invoice if invoice_id changed (shouldn't happen normally)
  IF TG_OP = 'UPDATE' AND OLD.invoice_id <> NEW.invoice_id THEN
    SELECT COALESCE(SUM(m.matched_amount), 0) INTO v_matched
    FROM matches m
    WHERE m.invoice_id = OLD.invoice_id;

    SELECT total_amount INTO v_invoice_total
    FROM invoices
    WHERE id = OLD.invoice_id;

    UPDATE invoices
    SET
      matched_amount = v_matched,
      status = CASE
        WHEN v_matched = 0 THEN 'new'
        WHEN ABS(v_matched) >= ABS(v_invoice_total) THEN 'fully_matched'
        ELSE 'partially_matched'
      END
    WHERE id = OLD.invoice_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
