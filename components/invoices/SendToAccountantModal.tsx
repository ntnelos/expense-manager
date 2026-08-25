'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SendToAccountantModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparedData, setPreparedData] = useState<any>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const router = useRouter();

  const handlePrepare = async () => {
    setIsPreparing(true);
    setError(null);
    setPreparedData(null);
    setIsSuccess(false);
    setLogs([]);

    try {
      const url = `/api/export/accountant/prepare`;
      const res = await fetch(url);
      
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        const text = await res.text();
        console.error('Server returned HTML instead of JSON:', text);
        throw new Error('שגיאת שרת: התקבלה תשובה לא תקינה מהשרת. ייתכן שהפעולה לקחה זמן רב מדי או שיש שגיאת מערכת.');
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error('שגיאה בגישה לשרת: ' + errText);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('לא ניתן לקרוא נתונים מהשרת');
      }

      let done = false;
      let buffer = '';
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          
          buffer = lines.pop() || ''; // Keep the incomplete event in the buffer
          
          for (const event of lines) {
            const dataLine = event.split('\n').find(l => l.startsWith('data: '));
            if (dataLine) {
              try {
                const data = JSON.parse(dataLine.substring(6));
                if (data.type === 'log') {
                  setLogs(prev => [...prev, data.message]);
                } else if (data.type === 'progress') {
                  setLogs(prev => {
                    const newLogs = [...prev];
                    if (newLogs.length > 0 && newLogs[newLogs.length - 1].startsWith('מעבד קובץ')) {
                      newLogs[newLogs.length - 1] = data.message;
                    } else {
                      newLogs.push(data.message);
                    }
                    return newLogs;
                  });
                } else if (data.type === 'complete') {
                  setPreparedData(data);
                } else if (data.type === 'error') {
                  throw new Error(data.error);
                }
              } catch (e: any) {
                if (e.message !== 'Unexpected end of JSON input') {
                  console.error("Failed to parse SSE event:", event, e);
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsPreparing(false);
    }
  };

  const handleSend = async () => {
    if (!preparedData) return;
    setIsSending(true);
    setError(null);

    try {
      const res = await fetch('/api/export/accountant/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceIds: preparedData.invoiceIds,
          pdfFileIds: preparedData.pdfFiles.map((f: any) => f.id),
          excelFileId: preparedData.excel.id
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        if (data.tooLarge) {
          setError(data.error); // Show the too large error as a warning/info
        } else {
          throw new Error(data.error || 'Failed to send email');
        }
      }
      
      setIsSuccess(true);
      window.dispatchEvent(new Event('invoices-updated'));
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsSending(false);
    }
  };

  const reset = () => {
    setIsOpen(false);
    setPreparedData(null);
    setIsSuccess(false);
    setError(null);
    setLogs([]);
    window.dispatchEvent(new Event('invoices-updated'));
  };

  return (
    <>
      <button className="btn btn-primary" onClick={() => setIsOpen(true)}>
        📨 שלח לרו״ח
      </button>

      {isOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1000 }}>
          <div className="modal-content animate-in" style={{ maxWidth: '500px', width: '90%' }}>
            <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
              שליחת חשבוניות לרואה חשבון
            </h2>
            
            {error && !isSuccess && (
              <div style={{ color: 'var(--color-error)', backgroundColor: 'var(--color-surface-hover)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
                {error}
              </div>
            )}

            {!preparedData && !isSuccess && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                <p style={{ color: 'var(--color-text-secondary)' }}>
                  פעולה זו תיקח את <b>כל</b> החשבוניות שאושרו / הותאמו ועדיין לא נשלחו לרואה החשבון (מכל החודשים), תשרשר אותן לקובץ PDF אחד, ותשלח אותן יחד עם אקסל פירוט התאמות.
                </p>
                
                {isPreparing && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', margin: 'var(--space-4) 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div className="spinner" style={{ width: '24px', height: '24px', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                      <div style={{ fontWeight: 600 }}>מכין קבצים... פעולה זו עשויה לקחת מספר דקות</div>
                    </div>
                    
                    <div style={{ 
                      backgroundColor: 'var(--color-surface)', 
                      padding: 'var(--space-3)', 
                      borderRadius: 'var(--radius-md)', 
                      border: '1px solid var(--color-border)',
                      maxHeight: '150px',
                      overflowY: 'auto',
                      fontSize: '13px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      {logs.length === 0 ? (
                        <div style={{ color: 'var(--color-text-secondary)' }}>מתחיל תהליך...</div>
                      ) : (
                        logs.map((log, i) => (
                          <div key={i} style={{ 
                            color: i === logs.length - 1 ? 'var(--color-text)' : 'var(--color-text-secondary)',
                            fontWeight: i === logs.length - 1 ? 600 : 400
                          }}>
                            {i === logs.length - 1 ? '⏳ ' : '✓ '} {log}
                          </div>
                        ))
                      )}
                    </div>

                    <style>{`
                      @keyframes spin {
                        to { transform: rotate(360deg); }
                      }
                    `}</style>
                  </div>
                )}
              </div>
            )}

            {preparedData && !isSuccess && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                <div style={{ backgroundColor: 'var(--color-success)', color: 'white', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  הקבצים מוכנים! נמצאו {preparedData.count} חשבוניות.
                </div>
                
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', textAlign: 'center' }}>
                  לפני השליחה, מומלץ להוריד ולבדוק את הקבצים שיועברו:
                </p>
                
                  <button 
                    onClick={() => {
                      window.open(preparedData.zip.url, '_blank');
                    }}
                    className="btn btn-secondary" 
                    style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', padding: 'var(--space-4)', height: 'auto', gap: 'var(--space-2)', alignItems: 'center' }}
                  >
                    <span style={{ fontSize: '24px' }}>📥</span>
                    <span style={{ fontWeight: 'bold' }}>הורדת קובץ ZIP מאוחד (אקסל + כל תמונות החשבוניות)</span>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>כל הקבצים כווצו לקובץ אחד להורדה מהירה</span>
                  </button>
              </div>
            )}

            {isSuccess && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', alignItems: 'center' }}>
                <div style={{ fontSize: '48px' }}>✅</div>
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>הקבצים נשלחו לרואה החשבון בהצלחה!</h3>
                <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                  הסטטוס של כל החשבוניות עודכן ל"נשלח לרו״ח".
                  המייל המקורי הועבר ונמצא כעת בתיקיית דואר יוצא במייל שלך.
                </p>
                
                {error && (
                  <div style={{ color: 'var(--color-warning)', backgroundColor: 'var(--color-surface-hover)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginTop: 'var(--space-2)' }}>
                    <strong>שים לב:</strong> {error}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
              {isSuccess ? (
                <button className="btn btn-primary" onClick={reset}>
                  סיום
                </button>
              ) : (
                <>
                  <button className="btn btn-secondary" onClick={reset} disabled={isPreparing || isSending}>
                    ביטול
                  </button>
                  
                  {!preparedData ? (
                    <button className="btn btn-primary" onClick={handlePrepare} disabled={isPreparing}>
                      {isPreparing ? 'מכין קבצים...' : 'המשך'}
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={handleSend} disabled={isSending}>
                      {isSending ? 'שולח...' : 'אישור שליחה למייל'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
