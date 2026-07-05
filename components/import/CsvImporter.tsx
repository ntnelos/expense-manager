'use client';

import { useState, useRef, ChangeEvent, DragEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'upload' | 'mapping' | 'preview' | 'result';

interface FieldMap {
  transaction_date: string;
  charge_date: string;
  amount: string;
  total_amount: string;
  description: string;
  card_last_digits: string;
  original_category: string;
  source_identifier: string;
}

const DEFAULT_MAP: FieldMap = {
  transaction_date: '',
  charge_date: '',
  amount: '',
  total_amount: '',
  description: '',
  card_last_digits: '',
  original_category: '',
  source_identifier: '',
};

interface ColumnMapping {
  id: string;
  mapping_name: string;
  header_pattern: string[];
  column_map: FieldMap;
}

export default function CsvImporter() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [extractedCardDigits, setExtractedCardDigits] = useState<string | null>(null);
  const [chargeDateOverride, setChargeDateOverride] = useState<string>('');
  
  const [fieldMap, setFieldMap] = useState<FieldMap>({ ...DEFAULT_MAP });
  
  const [savedMappings, setSavedMappings] = useState<ColumnMapping[]>([]);
  const [selectedMapping, setSelectedMapping] = useState<string>('');
  
  const [saveMappingName, setSaveMappingName] = useState('');
  
  const [isDragOver, setIsDragOver] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number, duplicates: number, errors: number, skippedLines?: any[] } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/column-mappings')
      .then(res => res.json())
      .then(data => setSavedMappings(data.mappings || []))
      .catch(console.error);
  }, []);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = async (selectedFile: File) => {
    const name = selectedFile.name.toLowerCase();
    const isCSV = name.endsWith('.csv');
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');

    if (!isCSV && !isExcel) {
      alert('נא להעלות קובץ CSV או Excel (xlsx/xls) בלבד.');
      return;
    }

    setFile(selectedFile);

    try {
      // Parse server-side so Hebrew encoding works correctly
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/import/parse', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'שגיאה בפענוח הקובץ');
      }

      const data = await res.json();
      console.log('[Import Debug] Server response:', JSON.stringify(data).substring(0, 500));

      const { headers, rows } = data;

      if (!headers || headers.length === 0) {
        alert('לא זוהו עמודות בקובץ. וודא שהקובץ תקין.');
        return;
      }

      setHeaders(headers);
      
      // Filter out junk rows (like "סה"כ" or "עסקאות מחוייבות") from the preview
      const cleanRows = rows.filter((r: string[]) => {
        const rowText = r.join(' ');
        if (rowText.includes('סה"כ') || rowText.includes('לידיעה בלבד')) return false;
        return true;
      });
      
      setRows(cleanRows);
      setExtractedCardDigits(data.metadata?.cardLastDigits || null);
      setStep('mapping');

      // Auto-detect mapping if headers match a saved pattern
      autoDetectMapping(headers);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'שגיאה בקריאת הקובץ.');
    }
  };

  const autoDetectMapping = (currentHeaders: string[]) => {
    // Find the first mapping where all mapped columns exist in the current headers
    const match = savedMappings.find(m => {
      const mappedCols = Object.values(m.column_map).filter(val => val !== '');
      if (mappedCols.length === 0) return false;
      return mappedCols.every(col => currentHeaders.includes(col as string));
    });

    if (match) {
      setFieldMap(match.column_map);
      setSelectedMapping(match.id);
    }
  };

  const handleMappingSelect = (mappingId: string) => {
    setSelectedMapping(mappingId);
    if (mappingId === '') {
      setFieldMap({ ...DEFAULT_MAP });
    } else {
      const mapping = savedMappings.find(m => m.id === mappingId);
      if (mapping) setFieldMap(mapping.column_map);
    }
  };

  // Convert an Israeli date like DD/MM/YYYY or DD/MM/YY to YYYY-MM-DD
  const parseDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.trim().split(/[\/.-]/);
    if (parts.length !== 3) return dateStr;
    
    let year = parts[2];
    // If year is 2 digits (e.g. 26), assume 2026
    if (year.length === 2) {
      year = `20${year}`;
    }

    // Assume DD/MM/YYYY if year is 4 digits
    if (year.length === 4) {
      return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return dateStr;
  };

  const parseAmount = (amountStr: string) => {
    if (!amountStr) return 0;
    // Remove commas, NIS symbol etc
    const cleanStr = amountStr.replace(/[^\d.-]/g, '');
    return parseFloat(cleanStr) || 0;
  };

  const getMappedData = () => {
    return rows.map(row => {
      const getVal = (colName: string) => {
        if (!colName) return '';
        const idx = headers.indexOf(colName);
        return idx >= 0 ? row[idx] : '';
      };

      const description = getVal(fieldMap.description);
      
      // Parse installments from description (e.g., "עסקה בתשלומים תשלום - 1 מ - 3")
      let installment_current = null;
      let installment_total = null;
      const instMatch = description.match(/תשלום\s*-\s*(\d+)\s*מ\s*-\s*(\d+)/i) || description.match(/תשלום\s+(\d+)\s+מתוך\s+(\d+)/i);
      if (instMatch) {
        installment_current = parseInt(instMatch[1], 10);
        installment_total = parseInt(instMatch[2], 10);
      }

      const chargeDateMapped = fieldMap.charge_date !== '' ? parseDate(getVal(fieldMap.charge_date)) : null;

      // Extract currency from the total_amount column
      let currency = 'ILS';
      const totalAmountStr = fieldMap.total_amount !== '' ? String(getVal(fieldMap.total_amount)) : '';
      if (totalAmountStr.includes('$') || totalAmountStr.toLowerCase().includes('usd')) currency = 'USD';
      else if (totalAmountStr.includes('€') || totalAmountStr.toLowerCase().includes('eur')) currency = 'EUR';
      else if (totalAmountStr.includes('£') || totalAmountStr.toLowerCase().includes('gbp')) currency = 'GBP';

      return {
        transaction_date: fieldMap.transaction_date !== '' ? parseDate(getVal(fieldMap.transaction_date)) : '',
        charge_date: chargeDateMapped || chargeDateOverride || null,
        amount: fieldMap.amount !== '' ? parseAmount(getVal(fieldMap.amount)) : null,
        total_amount: fieldMap.total_amount !== '' ? parseAmount(getVal(fieldMap.total_amount)) : null,
        installment_current,
        installment_total,
        description,
        card_last_digits: (fieldMap.card_last_digits !== '' ? getVal(fieldMap.card_last_digits) : null) || extractedCardDigits,
        original_category: fieldMap.original_category !== '' ? getVal(fieldMap.original_category) : null,
        source_identifier: fieldMap.source_identifier !== '' ? getVal(fieldMap.source_identifier) : null,
        currency,
      };
    });
  };

  const handleImport = async () => {
    const rawMapped = getMappedData();
    console.log('[Import Debug] Raw Mapped Rows (first 3):', rawMapped.slice(0, 3));
    
    // Only import rows that have a valid parsed YYYY-MM-DD date and a valid number amount.
    const data = rawMapped.filter(row => 
      row.transaction_date && 
      row.transaction_date.match(/^\d{4}-\d{2}-\d{2}$/) && 
      row.amount !== null && 
      !isNaN(row.amount as number)
    );
    console.log('[Import Debug] Filtered Rows Length:', data.length);
    
    if (data.length === 0) {
      alert('אין נתונים תקינים לייבוא. וודא שמיפית תאריך וסכום בצורה נכונה.');
      return;
    }

    setIsImporting(true);

    try {
      // First save mapping if requested
      if (saveMappingName && selectedMapping === '') {
        await fetch('/api/column-mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mapping_name: saveMappingName,
            header_pattern: headers,
            column_map: fieldMap,
          }),
        });
      }

      // Then import rows
      const res = await fetch('/api/expense-lines/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: data,
          sourceFile: file?.name,
        }),
      });

      const result = await res.json();
      
      if (!res.ok) throw new Error(result.error);

      setImportResult(result);
      setStep('result');
    } catch (err: any) {
      alert(err.message || 'שגיאה בייבוא נתונים.');
    } finally {
      setIsImporting(false);
    }
  };

  const renderUpload = () => (
    <div className="card">
      <div className="card-body">
        <div
          className={`file-uploader ${isDragOver ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ cursor: 'pointer' }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
          />
          <div className="file-uploader-icon">📊</div>
          <div className="file-uploader-text">
            גרור והשלך קובץ CSV או Excel של תנועות כאן, או <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>לחץ לבחירה</span>
          </div>
          <div className="file-uploader-hint">
            נתמך: CSV, xlsx, xls — ייצוא מהבנק או מחברות כרטיסי אשראי
          </div>
        </div>
      </div>
    </div>
  );

  const renderMapping = () => {
    const requiredFields = ['transaction_date', 'amount'];
    const isValid = requiredFields.every(f => fieldMap[f as keyof FieldMap] !== '');

    const previewData = getMappedData().slice(0, 3);

    return (
      <div className="card">
        <div className="card-body">
          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>מיפוי עמודות</h3>
          
          <div style={{ marginBottom: 'var(--space-6)', background: 'var(--color-bg-secondary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
              תבנית מיפוי שמורה:
            </label>
            <select
              value={selectedMapping}
              onChange={(e) => handleMappingSelect(e.target.value)}
              style={{ width: '100%', maxWidth: '300px' }}
            >
              <option value="">-- מיפוי מותאם אישית חדש --</option>
              {savedMappings.map(m => (
                <option key={m.id} value={m.id}>{m.mapping_name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
            {[
              { key: 'transaction_date', label: 'תאריך עסקה (חובה)', required: true },
              { key: 'amount', label: 'סכום חיוב (חובה)', required: true },
              { key: 'total_amount', label: 'סכום העסקה (כולל)' },
              { key: 'description', label: 'תיאור / בית עסק' },
              { key: 'charge_date', label: 'תאריך חיוב (בעמודה)' },
              { key: 'card_last_digits', label: '4 ספרות כרטיס' },
              { key: 'original_category', label: 'ענף / קטגוריה בנקאית' },
              { key: 'source_identifier', label: 'מספר אסמכתא' },
            ].map((field) => (
              <div key={field.key}>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                  {field.label}
                </label>
                <select
                  value={fieldMap[field.key as keyof FieldMap]}
                  onChange={(e) => setFieldMap({ ...fieldMap, [field.key]: e.target.value })}
                  style={{ width: '100%' }}
                >
                  <option value="">-- לא ממופה --</option>
                  {headers.map((h, i) => (
                    <option key={i} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 'var(--space-6)', background: 'var(--color-bg-tertiary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
            <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>הגדרות גלובליות לקובץ</h4>
            <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-1)' }}>
                  תאריך חיוב כללי (אם חסר בעמודות):
                </label>
                <input
                  type="date"
                  value={chargeDateOverride}
                  onChange={(e) => setChargeDateOverride(e.target.value)}
                  style={{ width: '200px' }}
                />
              </div>
              {extractedCardDigits && (
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-1)' }}>
                    כרטיס שזוהה בקובץ:
                  </label>
                  <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)', padding: 'var(--space-2) 0' }}>
                    **** {extractedCardDigits}
                  </div>
                </div>
              )}
            </div>
          </div>

          {selectedMapping === '' && (
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>
                <input 
                  type="checkbox" 
                  checked={!!saveMappingName} 
                  onChange={(e) => setSaveMappingName(e.target.checked ? 'תבנית חדשה' : '')} 
                />
                שמור מיפוי זה כתבנית לשימוש עתידי
              </label>
              {saveMappingName !== '' && (
                <input
                  type="text"
                  value={saveMappingName}
                  onChange={(e) => setSaveMappingName(e.target.value)}
                  placeholder="שם התבנית (לדוגמה: ויזה כאל)"
                  style={{ marginTop: 'var(--space-2)', maxWidth: '300px' }}
                />
              )}
            </div>
          )}

          <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>תצוגה מקדימה ({rows.length} שורות סה״כ):</h4>
          <div className="data-table-container" style={{ marginBottom: 'var(--space-6)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>תאריך עסקה</th>
                  <th>סכום</th>
                  <th>תיאור</th>
                  <th>תאריך חיוב</th>
                  <th>כרטיס</th>
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, i) => (
                  <tr key={i}>
                    <td>{row.transaction_date || '-'}</td>
                    <td>{row.amount !== null ? row.amount : '-'}</td>
                    <td>{row.description || '-'}</td>
                    <td>{row.charge_date || '-'}</td>
                    <td>{row.card_last_digits || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
            <button className="btn btn-secondary" onClick={() => setStep('upload')}>
              חזור
            </button>
            <button 
              className="btn btn-primary" 
              disabled={!isValid || isImporting}
              onClick={handleImport}
            >
              {isImporting ? 'מייבא...' : `ייבא ${rows.length} שורות`}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderResult = () => (
    <div className="card">
      <div className="card-body" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>✅</div>
        <h3 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
          הייבוא הושלם בהצלחה
        </h3>
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-6)', margin: 'var(--space-6) 0' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-success)' }}>{importResult?.inserted}</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>שורות חדשות</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-warning)' }}>{importResult?.duplicates}</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>כפילויות (נפסחו)</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: importResult?.errors ? 'var(--color-error)' : 'var(--color-text-muted)' }}>{importResult?.errors}</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>שגיאות</div>
          </div>
        </div>

        {importResult?.skippedLines && importResult.skippedLines.length > 0 && (
          <div style={{ marginTop: 'var(--space-6)', textAlign: 'right' }}>
            <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>שורות כפולות שנפסחו ({importResult.skippedLines.length}):</h4>
            <div className="data-table-container" style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--color-glass-border)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>תאריך עסקה</th>
                    <th>סכום</th>
                    <th>תיאור</th>
                    <th>כרטיס</th>
                  </tr>
                </thead>
                <tbody>
                  {importResult.skippedLines.map((row, i) => (
                    <tr key={i}>
                      <td>{row.transaction_date || '-'}</td>
                      <td style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{row.amount !== null ? row.amount : '-'}</td>
                      <td>{row.description || '-'}</td>
                      <td>{row.card_last_digits || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-4)', marginTop: 'var(--space-8)' }}>
          <button className="btn btn-secondary" onClick={() => { setStep('upload'); setFile(null); }}>
            ייבא קובץ נוסף
          </button>
          <button className="btn btn-primary" onClick={() => router.push('/expense-lines')}>
            עבור לשורות הוצאה
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="csv-importer animate-in">
      {/* Wizard Steps */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)', padding: 'var(--space-4)', background: 'var(--color-glass)', borderRadius: 'var(--radius-md)' }}>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: step === 'upload' ? 700 : 400, color: step === 'upload' ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
          1. העלאת קובץ
        </div>
        <div>/</div>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: step === 'mapping' ? 700 : 400, color: step === 'mapping' ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
          2. מיפוי עמודות
        </div>
        <div>/</div>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: step === 'result' ? 700 : 400, color: step === 'result' ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
          3. סיכום
        </div>
      </div>

      {step === 'upload' && renderUpload()}
      {step === 'mapping' && renderMapping()}
      {step === 'result' && renderResult()}
    </div>
  );
}
