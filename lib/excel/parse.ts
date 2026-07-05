import * as XLSX from 'xlsx';

export interface ParsedSheetResult {
  headers: string[];
  rows: string[][];
  sheetNames: string[];
}

/**
 * Parses an Excel file buffer (.xlsx / .xls) and returns headers + rows.
 * Handles Hebrew encoding (Windows-1255) common in Israeli bank exports.
 * Also skips leading empty/metadata rows that Israeli banks often include.
 */
export function parseExcel(buffer: ArrayBuffer, sheetIndex = 0): ParsedSheetResult {
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    codepage: 1255, // Windows-1255 for Hebrew
  });

  const sheetName = workbook.SheetNames[sheetIndex] ?? workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to array-of-arrays with raw = false (format values as strings)
  const allData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  if (allData.length === 0) return { headers: [], rows: [], sheetNames: workbook.SheetNames };

  // Find the first row that looks like a header:
  // a row with at least 3 non-empty cells. Israeli banks often have
  // a few metadata rows at the top before the actual table starts.
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(allData.length, 20); i++) {
    const nonEmpty = allData[i].filter((c: any) => String(c ?? '').trim() !== '');
    if (nonEmpty.length >= 3) {
      headerRowIndex = i;
      break;
    }
  }

  const headers = allData[headerRowIndex].map((h: any) => String(h ?? '').trim());

  const rows = allData
    .slice(headerRowIndex + 1)
    .filter((row: any[]) => row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row: any[]) => {
      // Ensure each row has the same number of columns as the header
      const padded = [...row];
      while (padded.length < headers.length) padded.push('');
      return padded.map((cell: any) => String(cell ?? '').trim());
    });

  return { headers, rows, sheetNames: workbook.SheetNames };
}
