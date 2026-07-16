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

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data, error } = await supabase
        .from('gmail_sync_config')
        .select('email_address, last_sync_at')
        .maybeSingle();
        
      if (data) {
        setConfig(data);
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
        fetchConfig(); // Refresh last sync date
      } else {
        setMessage(`שגיאה בסריקה: ${data.error}`);
      }
    } catch (err: any) {
      setMessage(`שגיאה בסריקה: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'לא בוצעה סריקה מעולם (יסרוק החל מ-01/06/2026)';
    return new Date(dateStr).toLocaleString('he-IL');
  };

  if (loading) {
    return <div className="card p-6 mb-6">טוען הגדרות Gmail...</div>;
  }

  return (
    <div className="card p-6 mb-6">
      <h2 className="text-xl font-bold mb-4">סריקת חשבוניות מ-Gmail (ארגוני)</h2>
      
      {message && (
        <div className={`p-3 mb-4 rounded ${message.includes('שגיאה') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
          {message}
        </div>
      )}
      
      {!config ? (
        <div>
          <p className="mb-4 text-gray-600">
            הזן את כתובת המייל הארגונית שממנה תרצה לייבא חשבוניות. 
            המערכת משתמשת בהרשאות אדמין (Domain-Wide Delegation) ולכן אין צורך בהתחברות אישית.
          </p>
          <div className="flex gap-2 max-w-md">
            <input 
              type="email" 
              placeholder="fin@confettix.co.il" 
              className="input flex-1 text-left direction-ltr"
              value={inputEmail}
              onChange={(e) => setInputEmail(e.target.value)}
              dir="ltr"
            />
            <button 
              onClick={handleConnect}
              className="btn btn-primary bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
            >
              הגדר תיבה
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-4">
            <p className="font-semibold text-blue-900 mb-1">מחובר לחשבון:</p>
            <p className="text-blue-800 mb-3">{config.email_address}</p>
            
            <p className="font-semibold text-blue-900 mb-1">סריקה אחרונה (Checkpoint):</p>
            <p className="text-blue-800 text-sm">
              {formatDate(config.last_sync_at)}
            </p>
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={handleManualSync}
              disabled={syncing}
              className={`btn btn-primary ${syncing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {syncing ? 'סורק...' : 'סרוק מייל כעת'}
            </button>
            <button 
              onClick={handleDisconnect}
              disabled={syncing}
              className="btn btn-outline border-red-500 text-red-500 hover:bg-red-50"
            >
              נתק תיבה
            </button>
          </div>
          
          <p className="text-xs text-gray-500 mt-4">
            המערכת סורקת באופן אוטומטי ב-10 לכל חודש בשעה 03:00.
          </p>
        </div>
      )}
    </div>
  );
}
