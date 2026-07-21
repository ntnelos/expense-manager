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

  // Color code status column
  const statusColIndex = headers.indexOf('סטטוס התאמה') + 1;
  if (statusColIndex > 0) {
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header
      const cell = row.getCell(statusColIndex);
      const val = cell.value?.toString() || '';
      
      let color = '';
      if (val === 'הותאם' || val === 'נשלח לרו״ח') {
        color = 'FFDCFCE7'; // Light green
        cell.font = { color: { argb: 'FF166534' } }; // Dark green
      } else if (val === 'ממתין') {
        color = 'FFFEF9C3'; // Light yellow
        cell.font = { color: { argb: 'FF854D0E' } }; // Dark yellow
      } else if (val === 'אושר ללא חשבונית' || val === 'חלקי') {
        color = 'FFDBEAFE'; // Light blue
        cell.font = { color: { argb: 'FF1E40AF' } }; // Dark blue
      }
      
      if (color) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: color }
        };
      }
    });
  }

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
