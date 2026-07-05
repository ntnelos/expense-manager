import { GoogleGenAI, Type, Schema, HarmCategory, HarmBlockThreshold } from '@google/genai';

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable. Get one at https://aistudio.google.com/');
  }
  return new GoogleGenAI({ apiKey });
}

export interface ExtractedInvoiceData {
  supplier_name: string | null;
  supplier_tax_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null; // YYYY-MM-DD
  currency: string | null; // ILS, USD, EUR, etc.
  total_amount: number | null;
  vat_amount: number | null;
  document_type: 'tax_invoice' | 'receipt' | 'tax_invoice_receipt' | 'other';
  is_credit_note: boolean; // Must be true for credit notes
  suggested_category: string | null; // AI-suggested category name
}

const SYSTEM_PROMPT = `You are an expert OCR data extractor.
Extract the following fields from the invoice/receipt into a JSON object. Pay attention to Hebrew text and Israeli business details.

For "suggested_category", classify the expense into one of these categories based on the supplier name, items, and context:
דלק, מזון ומשקאות, שירותי ענן, ציוד משרדי, נסיעות, שירותים מקצועיים, תקשורת, ביטוח, השכרה ונדל"ן, אחר

Return EXACTLY and ONLY a JSON object with this structure (no markdown tags, no backticks, just raw JSON):
{
  "supplier_name": "string (שם הספק/בית העסק) or null",
  "supplier_tax_id": "string (מספר ח.פ / עוסק מורשה) or null",
  "invoice_number": "string (מספר חשבונית / מסמך / קבלה) or null",
  "invoice_date": "string in YYYY-MM-DD format or null",
  "currency": "string (ILS/USD/EUR/GBP) default ILS",
  "total_amount": number (extract ONLY the float/decimal) or null,
  "vat_amount": number or null,
  "document_type": "tax_invoice" | "receipt" | "tax_invoice_receipt" | "other",
  "is_credit_note": boolean,
  "suggested_category": "one of the category names listed above, or null if uncertain"
}`;

// Define safety settings to prevent false-positive blocks on invoice text
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

/**
 * Utility for retrying Gemini API calls if they fail due to network/timeout issues.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg = err.message || '';
      if (msg.includes('fetch failed') || msg.includes('ETIMEDOUT') || msg.includes('timeout') || err.status === 503 || err.status === 529) {
        if (i < retries) {
          console.warn(`Gemini API failed, retrying (${i + 1}/${retries})...`);
          await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Exponential backoff
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Extracts structured invoice data from an image buffer using Gemini 2.5 Flash.
 */
export async function extractInvoiceFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ExtractedInvoiceData> {
  const ai = getGeminiClient();
  const base64Image = imageBuffer.toString('base64');

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Image,
                mimeType: mimeType,
              },
            },
            { text: 'Extract structured information from this invoice image.' },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        safetySettings: safetySettings,
      },
    });

    return parseGeminiResponse(response);
  });
}

/**
 * Extracts structured invoice data from a PDF buffer using Gemini natively.
 */
export async function extractInvoiceFromPDF(
  pdfBuffer: Buffer
): Promise<ExtractedInvoiceData> {
  const ai = getGeminiClient();
  const base64Pdf = pdfBuffer.toString('base64');

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Pdf,
                mimeType: 'application/pdf',
              },
            },
            { text: 'Extract structured information from this PDF invoice.' },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        safetySettings: safetySettings,
      },
    });

    return parseGeminiResponse(response);
  });
}

function parseGeminiResponse(response: any): ExtractedInvoiceData {
  const content = response.text;
  
  if (!content) {
    console.error('Gemini OCR API Full Error Response:', JSON.stringify(response, null, 2));
    
    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const safetyRatings = candidate?.safetyRatings;
    
    let errorMsg = 'Empty response from Gemini API.';
    if (finishReason) {
      errorMsg += ` Finish reason: ${finishReason}.`;
    }
    if (safetyRatings) {
      errorMsg += ` Safety ratings: ${JSON.stringify(safetyRatings)}.`;
    }
    
    throw new Error(errorMsg);
  }

  // Strip possible markdown JSON wrapping
  let cleanedContent = content.trim();
  if (cleanedContent.startsWith('```json')) {
    cleanedContent = cleanedContent.substring(7);
  } else if (cleanedContent.startsWith('```')) {
    cleanedContent = cleanedContent.substring(3);
  }
  if (cleanedContent.endsWith('```')) {
    cleanedContent = cleanedContent.substring(0, cleanedContent.length - 3);
  }
  cleanedContent = cleanedContent.trim();

  let parsedData;
  try {
    parsedData = JSON.parse(cleanedContent);
  } catch (error) {
    console.error('Failed to parse Gemini OCR response JSON:', cleanedContent);
    throw new Error('Failed to parse the JSON response from Gemini API.');
  }

  return {
    supplier_name: parsedData.supplier_name || null,
    supplier_tax_id: parsedData.supplier_tax_id || null,
    invoice_number: parsedData.invoice_number || null,
    invoice_date: parsedData.invoice_date || null,
    currency: parsedData.currency || null,
    total_amount: parsedData.total_amount ? Number(parsedData.total_amount) : null,
    vat_amount: parsedData.vat_amount ? Number(parsedData.vat_amount) : null,
    document_type: parsedData.document_type || 'other',
    is_credit_note: !!parsedData.is_credit_note,
    suggested_category: parsedData.suggested_category || null,
  };
}
