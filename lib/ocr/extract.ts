import OpenAI from 'openai';
import * as pdfParse from 'pdf-parse';

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable.');
  }
  return new OpenAI({ apiKey });
}

export interface ExtractedInvoiceData {
  supplier_name: string | null;
  supplier_tax_id: string | null;
  invoice_date: string | null; // YYYY-MM-DD
  total_amount: number | null;
  vat_amount: number | null;
  document_type: 'tax_invoice' | 'receipt' | 'tax_invoice_receipt' | 'other';
  is_credit_note: boolean; // Must be true for credit notes
}

const SYSTEM_PROMPT = `You are an expert Israeli accountant and OCR document scanner.
Your task is to analyze the provided invoice/receipt data and extract key fields.
Please pay close attention to Hebrew text and Israeli business details.

Provide the response strictly in JSON format matching the following schema:
{
  "supplier_name": "String or null (שם הספק/בית העסק)",
  "supplier_tax_id": "String or null (מספר ח.פ / עוסק מורשה of the supplier)",
  "invoice_date": "String or null in YYYY-MM-DD format (תאריך המסמך)",
  "total_amount": "Number or null (סה\\\"כ לתשלום, extract only the number as float/decimal)",
  "vat_amount": "Number or null (סכום המע\\\"מ)",
  "document_type": "One of: 'tax_invoice' (חשבונית מס), 'receipt' (קבלה), 'tax_invoice_receipt' (חשבונית מס קבלה), 'other' (אחר)",
  "is_credit_note": "Boolean (true if the document is a Credit Note / Credit Invoice / זיכוי / חשבונית זיכוי. Note: Credit notes MUST be identified as true so the system can ignore them)"
}

Guidelines:
1. "supplier_name": Look for the main supplier header/logo.
2. "supplier_tax_id": A 9-digit number often prefixed with ח.פ or ע.מ.
3. "invoice_date": Parse Hebrew dates (e.g. 15 יולי 2026 or 15/07/26) to standard YYYY-MM-DD.
4. "total_amount": Look for "סה\\\"כ לתשלום", "לתשלום", "Total", or "סכום כולל". Always return as a raw number.
5. "vat_amount": Look for "מע\\\"מ", "מע\\\"מ 17%", "VAT".
6. "is_credit_note": If the document contains keywords like "זיכוי", "חשבונית זיכוי", "Credit Note", or represents a refund, set this to true.`;

/**
 * Extracts structured invoice data from an image buffer using GPT-4o Vision.
 */
export async function extractInvoiceFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ExtractedInvoiceData> {
  const openai = getOpenAIClient();
  const base64Image = imageBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract structured information from this invoice image.',
          },
          {
            type: 'image_url',
            image_url: {
              url: dataUrl,
            },
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
  });

  return parseOpenAIResponse(response.choices[0].message.content);
}

/**
 * Extracts structured invoice data from a PDF buffer.
 * First tries text extraction. If the PDF is scanned (no text), it falls back to a warning/error or basic extraction.
 */
export async function extractInvoiceFromPDF(
  pdfBuffer: Buffer
): Promise<ExtractedInvoiceData> {
  const openai = getOpenAIClient();

  // Extract raw text from the PDF resolving CJS default export wrapper
  // @ts-ignore
  const parse = pdfParse.default || pdfParse;
  const pdfData = await parse(pdfBuffer);
  const pdfText = pdfData.text.trim();

  if (!pdfText) {
    throw new Error(
      'The PDF appears to be empty or scanned (contains no selectable text). Scanned PDFs are not supported without native PDF-to-Image converters.'
    );
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: `Extract structured information from this PDF text:\n\n${pdfText}`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  return parseOpenAIResponse(response.choices[0].message.content);
}

function parseOpenAIResponse(content: string | null): ExtractedInvoiceData {
  if (!content) {
    throw new Error('Empty response from OpenAI API.');
  }

  const parsedData = JSON.parse(content);

  return {
    supplier_name: parsedData.supplier_name || null,
    supplier_tax_id: parsedData.supplier_tax_id || null,
    invoice_date: parsedData.invoice_date || null,
    total_amount: parsedData.total_amount ? Number(parsedData.total_amount) : null,
    vat_amount: parsedData.vat_amount ? Number(parsedData.vat_amount) : null,
    document_type: parsedData.document_type || 'other',
    is_credit_note: !!parsedData.is_credit_note,
  };
}
