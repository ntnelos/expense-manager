'use client';

import { useState } from 'react';

export default function DownloadInvoicesModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [status, setStatus] = useState('all'); // all, matched, pending
  const [downloadCount, setDownloadCount] = useState('all'); // all, zero, one

  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setIsDownloading(true);
    setError(null);
    try {
      const url = `/api/export-zip?month=${month}&status=${status}&downloadCount=${downloadCount}`;
      const res = await fetch(url);
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to download zip');
      }

      // Read as blob
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `invoices_${month}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setIsOpen(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <button className="btn btn-secondary" onClick={() => setIsOpen(true)}>
        📥 הורדת חשבוניות (ZIP)
      </button>

      {isOpen && (
        <div className="modal-backdrop">
          <div className="modal-content animate-in" style={{ maxWidth: '400px' }}>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
              הורדת קבצי חשבוניות
            </h2>
            
            {error && (
              <div style={{ color: 'var(--color-error)', marginBottom: 'var(--space-3)' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-1)', color: 'var(--color-text-secondary)' }}>
                  חודש (תאריך חשבונית)
                </label>
                <input 
                  type="month" 
                  className="input" 
                  value={month} 
                  onChange={e => setMonth(e.target.value)} 
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-1)', color: 'var(--color-text-secondary)' }}>
                  סטטוס התאמה
                </label>
                <select className="input" value={status} onChange={e => setStatus(e.target.value)} style={{ width: '100%' }}>
                  <option value="all">כל החשבוניות</option>
                  <option value="matched">רק חשבוניות שהותאמו</option>
                  <option value="pending">רק חשבוניות ממתינות</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-1)', color: 'var(--color-text-secondary)' }}>
                  היסטוריית הורדות
                </label>
                <select className="input" value={downloadCount} onChange={e => setDownloadCount(e.target.value)} style={{ width: '100%' }}>
                  <option value="all">הכל</option>
                  <option value="zero">לא הורדו מעולם (0 פעמים)</option>
                  <option value="one">הורדו פעם אחת בלבד</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setIsOpen(false)} disabled={isDownloading}>
                ביטול
              </button>
              <button className="btn btn-primary" onClick={handleDownload} disabled={isDownloading || !month}>
                {isDownloading ? 'מכין קובץ...' : 'הורד קובץ ZIP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
