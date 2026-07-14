import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { parseCSV } from '@/lib/csv/parse';

export interface BlockResponse {
  id: string;
  startRowIndex: number;
  headers: string[];
  rows: string[][];
}

function extractAllTables(allRows: any[][]): { blocks: BlockResponse[]; metadata: any } {
  interface TableBlock {
    startRowIndex: number;
    header: string[];
    data: string[][];
  }
  
  const blocks: TableBlock[] = [];
  let currentBlock: TableBlock | null = null;
  
  let cardLastDigits = null;

  for (let i = 0; i < allRows.length; i++) {
    const rawRow = allRows[i];
    const rowStrArr = rawRow.map(c => String(c ?? '').trim());
    const nonEmpty = rowStrArr.filter(c => c !== '');
    const rowText = rowStrArr.join(' ');
    
    if (blocks.length === 0 && !cardLastDigits) {
      const cardMatch = rowText.match(/כרטיס.*?(\d{4})\b/i);
      if (cardMatch) cardLastDigits = cardMatch[1];
    }
    
    const hasHeaderKeywords = nonEmpty.some(c => 
      c.includes('תאריך') || c.includes('סכום') || c.includes('עסקה') || c.includes('שם') || c.includes('פירוט')
    );
    const containsDate = nonEmpty.some(c => c.match(/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/));
    
    const isHeader = nonEmpty.length >= 3 && hasHeaderKeywords && !containsDate;
    
    if (isHeader) {
      currentBlock = { startRowIndex: i, header: rowStrArr, data: [] };
      blocks.push(currentBlock);
      continue;
    }
    
    if (currentBlock && nonEmpty.length > 0) {
      const containsNumberOrDate = nonEmpty.some(c => c.match(/\d/));
      if (nonEmpty.length <= 2 && !containsNumberOrDate) {
         currentBlock = null;
      } else {
         currentBlock.data.push(rowStrArr);
      }
    }
  }
  
  const blockResponses: BlockResponse[] = blocks.map((block, index) => {
    // Filter summary rows and pad data rows to match header length
    const cleanRows = block.data
      .filter(row => {
        const rowText = row.join(' ');
        return !rowText.includes('סה"כ') && !rowText.includes('סה״כ');
      })
      .map(row => {
        const padded = [...row];
        while (padded.length < block.header.length) padded.push('');
        // Also truncate to header length just in case
        return padded.slice(0, block.header.length);
      });
      
    return {
      id: `block-${index + 1}`,
      startRowIndex: block.startRowIndex,
      headers: block.header,
      rows: cleanRows
    };
  }).filter(b => b.rows.length > 0); // Only return blocks that have data
  
  return { blocks: blockResponses, metadata: { cardLastDigits } };
}

function parseHTMLTable(html: string): { blocks: BlockResponse[]; metadata: any } {
  const rowMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const allRows: string[][] = rowMatches
    .map(rowMatch => {
      const cellHtml = rowMatch[1];
      const cellMatches = [...cellHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
      return cellMatches.map(cellMatch =>
        cellMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&nbsp;|&#160;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );
    })
    .filter(row => row.length > 0);

  return extractAllTables(allRows);
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

    let blocks: BlockResponse[] = [];
    let sheetNames: string[] = [];
    let metadata: any = {};

    if (isExcel) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const start = buffer.slice(0, 200).toString('utf8').trimStart();
      const isHTML = start.toUpperCase().startsWith('<HTML') || start.toUpperCase().startsWith('<!DOCTYPE');

      if (isHTML) {
        const html = buffer.toString('utf8');
        const parsed = parseHTMLTable(html);
        blocks = parsed.blocks;
        metadata = parsed.metadata;
        sheetNames = ['Sheet1'];
      } else {
        const workbook = XLSX.read(buffer, {
          type: 'buffer',
          cellDates: true,
          codepage: 1255, 
        });

        sheetNames = workbook.SheetNames;
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const allData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
          raw: false,
        });

        const parsed = extractAllTables(allData);
        blocks = parsed.blocks;
        metadata = parsed.metadata;
      }
    } else {
      // CSV
      const text = await file.text();
      const parsed = parseCSV(text);
      // For CSV, just wrap the single table in a block
      blocks = [{
        id: 'block-1',
        startRowIndex: 0,
        headers: parsed.headers,
        rows: parsed.rows
      }];
    }

    return NextResponse.json({ blocks, sheetNames, metadata });
  } catch (err: any) {
    console.error('File parse error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
