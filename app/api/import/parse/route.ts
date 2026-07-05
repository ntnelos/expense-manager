import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { parseCSV } from '@/lib/csv/parse';

/**
 * Parses an HTML table (common for Israeli bank "Excel" exports).
 * Israeli banks like Leumi export HTML files with .xls extension.
 * Scans ALL <tr> rows in the document and picks the one with the most cells.
 */
function parseHTMLTable(html: string): { headers: string[]; rows: string[][]; metadata: any } {
  // Find ALL <tr>...</tr> blocks in the entire document
  const rowMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  const allRows: string[][] = rowMatches
    .map(rowMatch => {
      const cellHtml = rowMatch[1];
      const cellMatches = [...cellHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
      return cellMatches.map(cellMatch =>
        cellMatch[1]
          .replace(/<[^>]+>/g, '')   // strip HTML tags
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&nbsp;|&#160;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );
    })
    .filter(row => row.length > 0); // remove rows with no cells

  if (allRows.length === 0) return { headers: [], rows: [] };

  // Find the header row: the row with the most non-empty cells
  // within the first 40 rows (to handle banks that have lots of metadata)
  let headerRowIndex = 0;
  let maxNonEmpty = 0;
  for (let i = 0; i < Math.min(allRows.length, 40); i++) {
    const nonEmpty = allRows[i].filter(c => c !== '').length;
    if (nonEmpty > maxNonEmpty) {
      maxNonEmpty = nonEmpty;
      headerRowIndex = i;
    }
  }

  if (maxNonEmpty < 3) return { headers: [], rows: [], metadata: {} };

  const headers = allRows[headerRowIndex];
  
  // Extract metadata from rows before the header
  let cardLastDigits = null;
  const metadataRows = allRows.slice(0, headerRowIndex);
  for (const row of metadataRows) {
    const rowText = row.join(' ');
    // Match "כרטיס" followed by anything, ending with a 4-digit number
    const cardMatch = rowText.match(/כרטיס.*?(\d{4})\b/i);
    if (cardMatch) {
      cardLastDigits = cardMatch[1];
      break;
    }
  }

  const rows = allRows
    .slice(headerRowIndex + 1)
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const padded = [...row];
      while (padded.length < headers.length) padded.push('');
      return padded;
    });

  return { headers, rows, metadata: { cardLastDigits } };
}


export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    const isCSV = fileName.endsWith('.csv');

    if (!isExcel && !isCSV) {
      return NextResponse.json({ error: 'Unsupported file type. Use CSV, XLSX, or XLS.' }, { status: 400 });
    }

    let headers: string[] = [];
    let rows: string[][] = [];
    let sheetNames: string[] = [];
    let metadata: any = {};

    if (isExcel) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Detect if this is actually an HTML file (common for Israeli bank exports)
      const start = buffer.slice(0, 200).toString('utf8').trimStart();
      const isHTML = start.toUpperCase().startsWith('<HTML') || start.toUpperCase().startsWith('<!DOCTYPE');

      if (isHTML) {
        // Parse as HTML table
        const html = buffer.toString('utf8');
        const parsed = parseHTMLTable(html);
        headers = parsed.headers;
        rows = parsed.rows;
        metadata = parsed.metadata;
        sheetNames = ['Sheet1'];
      } else {
        // Parse as real XLSX/XLS
        const workbook = XLSX.read(buffer, {
          type: 'buffer',
          cellDates: true,
          codepage: 1255, // Windows-1255 Hebrew encoding
        });

        sheetNames = workbook.SheetNames;
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const allData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
          raw: false,
        });

        // Find the header row: first row with 3+ non-empty cells
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(allData.length, 20); i++) {
          const nonEmpty = allData[i].filter((c: any) => String(c ?? '').trim() !== '');
          if (nonEmpty.length >= 3) {
            headerRowIndex = i;
            break;
          }
        }

        headers = allData[headerRowIndex]?.map((h: any) => String(h ?? '').trim()) ?? [];
        
        // Extract metadata from standard excel
        let cardLastDigits = null;
        for (let i = 0; i < headerRowIndex; i++) {
          const rowText = allData[i].map(c => String(c ?? '')).join(' ');
          const cardMatch = rowText.match(/כרטיס.*?(\d{4})\b/i);
          if (cardMatch) {
            cardLastDigits = cardMatch[1];
            break;
          }
        }
        metadata.cardLastDigits = cardLastDigits;

        rows = allData
          .slice(headerRowIndex + 1)
          .filter((row: any[]) => row.some((cell) => String(cell ?? '').trim() !== ''))
          .map((row: any[]) => {
            const padded = [...row];
            while (padded.length < headers.length) padded.push('');
            return padded.map((cell: any) => String(cell ?? '').trim());
          });
      }
    } else {
      // CSV
      const text = await file.text();
      const parsed = parseCSV(text);
      headers = parsed.headers;
      rows = parsed.rows;
    }

    return NextResponse.json({ headers, rows, sheetNames, metadata });
  } catch (err: any) {
    console.error('File parse error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
