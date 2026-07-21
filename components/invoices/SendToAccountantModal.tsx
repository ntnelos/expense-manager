'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SendToAccountantModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparedData, setPreparedData] = useState<any>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const router = useRouter();

  const handlePrepare = async () => {
    setIsPreparing(true);
    setError(null);
    setPreparedData(null);
    setIsSuccess(false);

    try {
      const url = `/api/export/accountant/prepare?month=${month}`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to prepare files');
      }

      setPreparedData(data);
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
          month,
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
                  פעולה זו תיקח את כל החשבוניות המותאמות בחודש הנבחר, תשרשר אותן לקובץ PDF אחד, ותשלח אותן יחד עם אקסל פירוט התאמות לרואה החשבון.
                </p>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                    חודש (תאריך חשבונית)
                  </label>
                  <input 
                    type="month" 
                    className="input" 
                    value={month} 
                    onChange={e => setMonth(e.target.value)} 
                    style={{ width: '100%', fontSize: 'var(--font-size-md)' }}
                    disabled={isPreparing}
                  />
                </div>
                
                {isPreparing && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', margin: 'var(--space-4) 0' }}>
                    <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    <div style={{ fontWeight: 600 }}>מכין קבצים... פעולה זו עשויה לקחת מספר דקות</div>
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
                      const urls = [preparedData.excel.url, ...(preparedData.pdfFiles?.map((p: any) => p.url) || [])];
                      urls.forEach((url, idx) => {
                        setTimeout(() => {
                          const iframe = document.createElement('iframe');
                          iframe.style.display = 'none';
                          iframe.src = url;
                          document.body.appendChild(iframe);
                          setTimeout(() => {
                            if (document.body.contains(iframe)) {
                              document.body.removeChild(iframe);
                            }
                          }, 5000);
                        }, idx * 600);
                      });
                    }}
                    className="btn btn-secondary" 
                    style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', padding: 'var(--space-4)', height: 'auto', gap: 'var(--space-2)', alignItems: 'center' }}
                  >
                    <span style={{ fontSize: '24px' }}>📥</span>
                    <span style={{ fontWeight: 'bold' }}>הורדת כל קבצי הייצוא (אקסל + תמונות מרוכזות)</span>
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
                    <button className="btn btn-primary" onClick={handlePrepare} disabled={isPreparing || !month}>
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
