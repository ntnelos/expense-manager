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

  useEffect(() => {
    fetchConfig();
    
    // Check for OAuth callbacks in URL
    const searchParams = new URLSearchParams(window.location.search);
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const errorMsg = searchParams.get('message');
    
    if (success === 'gmail_connected') {
      setMessage('חיבור ל-Gmail בוצע בהצלחה!');
      // Clean up URL
      window.history.replaceState({}, document.title, '/settings');
    } else if (error) {
      setMessage(`שגיאה בחיבור: ${errorMsg || error}`);
      window.history.replaceState({}, document.title, '/settings');
    }
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      // In a real app we'd have a GET endpoint for this, but we can query Supabase directly from client 
      // if RLS allows it. Since we haven't exposed a GET endpoint for config, let's create a quick API fetch
      // Actually, let's fetch using supabase client directly:
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

  const handleConnect = () => {
    window.location.href = '/api/auth/google/login';
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
      <h2 className="text-xl font-bold mb-4">סריקת חשבוניות מ-Gmail</h2>
      
      {message && (
        <div className={`p-3 mb-4 rounded ${message.includes('שגיאה') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
          {message}
        </div>
      )}
      
      {!config ? (
        <div>
          <p className="mb-4 text-gray-600">
            חבר את חשבון ה-Gmail שלך כדי לאפשר למערכת לסרוק חשבוניות באופן אוטומטי פעם בחודש. 
            בנוסף תוכל לבצע סריקה יזומה מתי שתרצה.
          </p>
          <button 
            onClick={handleConnect}
            className="btn btn-primary bg-blue-600 hover:bg-blue-700 text-white"
          >
            חבר חשבון Google
          </button>
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
