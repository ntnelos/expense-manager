import ExcelJS from 'exceljs';

export async function generateStyledExcel(headers: string[], rows: any[], sheetName: string = 'Expenses'): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ rightToLeft: true }] // RTL Support
  });

  // Setup columns
  worksheet.columns = headers.map(h => ({
    header: h,
    key: h,
    width: Math.max(h.length * 1.5, 15) // Dynamic width, min 15
  }));

  // Style the header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' } // Indigo color
    };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  // Add data rows
  rows.forEach((rowData) => {
    worksheet.addRow(rowData);
  });

  // Auto-filter
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rows.length + 1, column: headers.length }
  };

  // Adjust column widths based on content
  worksheet.columns.forEach((column, i) => {
    let maxLength = 0;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const columnLength = cell.value ? cell.value.toString().length : 10;
      if (columnLength > maxLength) {
        maxLength = columnLength;
      }
    });
    // Add some padding but limit max width
    column.width = Math.min(Math.max(maxLength + 2, 12), 50);
    
    // Default alignment
    column.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
