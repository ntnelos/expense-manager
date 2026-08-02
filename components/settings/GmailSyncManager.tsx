'use client';

import { useState, useEffect } from 'react';

interface SyncConfig {
  email_address: string;
  last_sync_at: string | null;
}

export default function GmailSyncManager() {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [inputEmail, setInputEmail] = useState('');

  // Checkpoint editing
  const [isEditingCheckpoint, setIsEditingCheckpoint] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [updatingCheckpoint, setUpdatingCheckpoint] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/import/gmail/config');
      if (res.ok) {
        const { config: data } = await res.json();
        if (data) {
          setConfig(data);
          if (data.last_sync_at) {
            // Format YYYY-MM-DD for date input
            const d = new Date(data.last_sync_at);
            setCustomDate(d.toISOString().slice(0, 10));
          } else {
            setCustomDate('2026-06-10');
          }
        } else {
          setConfig(null);
        }
      } else {
        setConfig(null);
      }
    } catch (err) {
      console.error('Error fetching Gmail config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!inputEmail || !inputEmail.includes('@')) {
      setMessage('נא להזין כתובת מייל תקינה');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/import/gmail/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_address: inputEmail })
      });
      
      const data = await res.json();
      if (res.ok) {
        setMessage('כתובת המייל הוגדרה בהצלחה!');
        fetchConfig();
      } else {
        setMessage(`שגיאה בהגדרה: ${data.error}`);
      }
    } catch (err) {
      setMessage('שגיאה בתקשורת עם השרת');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('האם אתה בטוח שברצונך לנתק את הגימייל? הסריקה האוטומטית תיפסק.')) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/import/gmail/disconnect', { method: 'POST' });
      if (res.ok) {
        setConfig(null);
        setMessage('החיבור נותק בהצלחה.');
      } else {
        throw new Error('שגיאה בניתוק');
      }
    } catch (err) {
      setMessage('שגיאה בניתוק החשבון');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setMessage('סורק מיילים... אנא המתן (פעולה זו עשויה לקחת מספר דקות).');
    
    try {
      const res = await fetch('/api/import/gmail/sync', { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        setMessage(`סריקה הסתיימה בהצלחה. נמצאו ועובדו ${data.count} חשבוניות חדשות.`);
        fetchConfig(); // Refresh last sync date from DB
      } else {
        setMessage(`שגיאה בסריקה: ${data.error}`);
      }
    } catch (err: any) {
      setMessage(`שגיאה בסריקה: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdateCheckpoint = async (newDateStr?: string) => {
    const targetDateStr = newDateStr || customDate;
    if (!targetDateStr) return;

    setUpdatingCheckpoint(true);
    try {
      const isoDate = new Date(`${targetDateStr}T00:00:00Z`).toISOString();
      const res = await fetch('/api/import/gmail/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_sync_at: isoDate })
      });

      if (res.ok) {
        setMessage(`תאריך סריקה אחרונה (Checkpoint) עודכן בהצלחה ב-DB ל-${new Date(isoDate).toLocaleDateString('he-IL')}.`);
        setIsEditingCheckpoint(false);
        fetchConfig();
      } else {
        const err = await res.json();
        setMessage(`שגיאה בעדכון תאריך: ${err.error}`);
      }
    } catch (err: any) {
      setMessage(`שגיאה בעדכון: ${err.message}`);
    } finally {
      setUpdatingCheckpoint(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'לא בוצעה סריקה מעולם (יסרוק החל מ-10/06/2026)';
    return new Date(dateStr).toLocaleString('he-IL');
  };

  if (loading) {
    return <div className="card p-6 mb-6">טוען הגדרות Gmail...</div>;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
      <h2 className="text-xl font-bold text-gray-900 mb-2">סריקת חשבוניות מ-Gmail (ארגוני)</h2>
      
      {message && (
        <div className={`p-3.5 mb-4 rounded-lg text-sm flex items-center justify-between ${message.includes('שגיאה') ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="font-bold text-sm px-2">&times;</button>
        </div>
      )}
      
      {!config ? (
        <div>
          <p className="mb-4 text-gray-600 text-sm">
            הזן את כתובת המייל הארגונית שממנה תרצה לייבא חשבוניות. 
            המערכת משתמשת בהרשאות אדמין (Domain-Wide Delegation) ולכן אין צורך בהתחברות אישית.
          </p>
          <div className="flex gap-2 max-w-md">
            <input 
              type="email" 
              placeholder="fin@confettix.co.il" 
              className="input flex-1 text-left direction-ltr border border-gray-300 rounded-lg px-4 py-2 text-sm"
              value={inputEmail}
              onChange={(e) => setInputEmail(e.target.value)}
              dir="ltr"
            />
            <button 
              onClick={handleConnect}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold whitespace-nowrap"
            >
              הגדר תיבה
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-blue-100 pb-3 mb-3">
              <div>
                <span className="text-xs font-semibold text-blue-900 uppercase tracking-wider block">חשבון מחובר</span>
                <span className="text-blue-950 font-bold text-base">{config.email_address}</span>
              </div>
              <div className="text-xs text-blue-800 bg-blue-100/80 px-3 py-1.5 rounded-lg border border-blue-200 font-medium">
                📅 סריקה אוטומטית: כל 10 לחודש בשעה 03:00
              </div>
            </div>
            
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-blue-900 uppercase tracking-wider block">סריקה אחרונה (Checkpoint ב-DB)</span>
                  <span className="text-blue-900 font-semibold text-sm">
                    {formatDate(config.last_sync_at)}
                  </span>
                </div>
                <button
                  onClick={() => setIsEditingCheckpoint(!isEditingCheckpoint)}
                  className="text-xs text-blue-700 hover:text-blue-900 underline font-medium"
                >
                  {isEditingCheckpoint ? 'ביטול עריכה' : 'שנה תאריך סריקה'}
                </button>
              </div>

              {isEditingCheckpoint && (
                <div className="mt-3 pt-3 border-t border-blue-200/60 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-700">קבע תאריך התחלה ל-DB:</span>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="px-3 py-1 bg-white border border-gray-300 rounded-md text-xs"
                  />
                  <button
                    onClick={() => handleUpdateCheckpoint()}
                    disabled={updatingCheckpoint}
                    className="px-3 py-1 bg-blue-700 text-white rounded-md text-xs font-semibold hover:bg-blue-800 disabled:opacity-50"
                  >
                    {updatingCheckpoint ? 'מעדכן...' : 'עדכן תאריך סריקה'}
                  </button>
                  <button
                    onClick={() => {
                      setCustomDate('2026-06-10');
                      handleUpdateCheckpoint('2026-06-10');
                    }}
                    disabled={updatingCheckpoint}
                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-semibold hover:bg-blue-200 border border-blue-300 disabled:opacity-50"
                  >
                    קבע ל-10/06/2026
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={handleManualSync}
              disabled={syncing}
              className={`px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center gap-2 ${syncing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span>{syncing ? '⌛ סורק מיילים...' : '🔄 סרוק מייל כעת (סריקה יזומה)'}</span>
            </button>
            <button 
              onClick={handleDisconnect}
              disabled={syncing}
              className="px-4 py-2.5 border border-red-300 text-red-600 hover:bg-red-50 font-medium text-sm rounded-lg transition-colors"
            >
              נתק תיבה
            </button>
          </div>
          
          <p className="text-xs text-gray-500 mt-4">
            * כל סריקה יזומה או אוטומטית תחל מתאריך הסריקה האחרונה, ותעדכן בסיומה את שדה Checkpoint ב-DB (`gmail_sync_config.last_sync_at`).
          </p>
        </div>
      )}
    </div>
  );
}
