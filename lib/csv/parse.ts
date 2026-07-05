/**
 * Simple CSV Parser that handles quoted strings and commas inside quotes.
 * Supports auto-detecting the delimiter (, ; \t)
 */

export function parseCSV(csvText: string): { headers: string[]; rows: string[][] } {
  // Try to determine the delimiter based on the first line
  const firstLine = csvText.split('\n')[0] || '';
  let delimiter = ',';
  if (firstLine.includes(';')) delimiter = ';';
  else if (firstLine.includes('\t')) delimiter = '\t';

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++; // Skip next quote
      } else {
        // Toggle quotes
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      // End of field
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      // End of row
      if (char === '\r' && nextChar === '\n') {
        i++; // Skip \n
      }
      if (currentField !== '' || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      // Normal character
      currentField += char;
    }
  }

  // Add the last field and row if the file didn't end with a newline
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  // Separate headers from data
  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1).filter(row => row.length > 0 && row.some(cell => cell.trim() !== ''));

  return { headers, rows: dataRows };
}
