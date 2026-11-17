import type { ExtractedInvoiceData } from './extract';

export interface NormalizedAmounts {
  currency: string;
  /** Amount in ILS (converted when the invoice is in a foreign currency). Negative for credit notes. */
  totalAmount: number | null;
  /** Amount in the invoice's own currency when it was converted, otherwise null. Negative for credit notes. */
  originalAmount: number | null;
}

async function fetchIlsRate(currency: string, date: string): Promise<number | null> {
  for (const path of [date, 'latest']) {
    try {
      const res = await fetch(`https://api.frankfurter.dev/v1/${path}?base=${currency}&symbols=ILS`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.rates?.ILS) return data.rates.ILS;
    } catch (err) {
      console.error(`Failed to fetch ${currency}->ILS exchange rate (${path}):`, err);
    }
  }
  return null;
}

/**
 * Post-OCR amount handling shared by every intake path (manual upload, Gmail, Telegram):
 * converts foreign-currency totals to ILS by the invoice-date rate, and makes credit notes negative.
 */
export async function normalizeOcrAmounts(ocr: ExtractedInvoiceData): Promise<NormalizedAmounts> {
  const currency = ocr.currency || 'ILS';
  let totalAmount = ocr.total_amount;
  let originalAmount: number | null = null;

  if (currency !== 'ILS' && ocr.total_amount && ocr.invoice_date) {
    const rate = await fetchIlsRate(currency, ocr.invoice_date);
    if (rate) {
      originalAmount = ocr.total_amount;
      totalAmount = Math.round(originalAmount * rate * 100) / 100;
    }
  }

  if (ocr.is_credit_note) {
    if (totalAmount !== null) totalAmount = -Math.abs(totalAmount);
    if (originalAmount !== null) originalAmount = -Math.abs(originalAmount);
  }

  return { currency, totalAmount, originalAmount };
}
