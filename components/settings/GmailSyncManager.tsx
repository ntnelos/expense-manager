'use client';

import { useState, useEffect, useRef } from 'react';
import { SyncRunState, SyncLogEntry } from '@/lib/gmail/tracker';

interface SyncConfig {
  email_address: string;
  last_sync_at: string | null;
}

export default function GmailSyncManager() {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [inputEmail, setInputEmail] = useState('');

  // Active run & logs
  const [activeRun, setActiveRun] = useState<SyncRunState | null>(null);
  const [recentRuns, setRecentRuns] = useState<SyncRunState[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryRun, setSelectedHistoryRun] = useState<SyncRunState | null>(null);
  const [copiedLogs, setCopiedLogs] = useState(false);

  // Checkpoint editing
  const [isEditingCheckpoint, setIsEditingCheckpoint] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [updatingCheckpoint, setUpdatingCheckpoint] = useState(false);

  const logTerminalRef = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    fetchConfig();
    fetchSyncStatus();
  }, []);

  // Polling when a scan is active
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (activeRun && activeRun.status === 'running') {
      interval = setInterval(() => {
        fetchSyncStatus();
      }, 1200);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeRun?.status]);

  // Auto-scroll logs terminal to bottom
  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [activeRun?.logs?.length]);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/import/gmail/config');
      if (res.ok) {
        const { config: data } = await res.json();
        if (data) {
          setConfig(data);
          if (data.last_sync_at) {
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

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch('/api/import/gmail/sync');
      if (res.ok) {
        const data = await res.json();
        
        // If an active run just finished, refresh config to display latest Checkpoint
        if (activeRun?.status === 'running' && data.activeRun?.status !== 'running') {
          fetchConfig();
        }

        setActiveRun(data.activeRun || null);
        if (data.recentRuns) {
          setRecentRuns(data.recentRuns);
        }
      }
    } catch (err) {
      console.error('Error polling sync status:', err);
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
    try {
      const res = await fetch('/api/import/gmail/sync', { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        if (data.activeRun) {
          setActiveRun(data.activeRun);
        }
        setMessage('הסריקה החלה ברקע. תוכל לעקוב אחר ההתקדמות בלוג הרץ מטה.');
        // Trigger immediate polling
        fetchSyncStatus();
      } else {
        setMessage(`שגיאה בהפעלת סריקה: ${data.error}`);
      }
    } catch (err: any) {
      setMessage(`שגיאה בסריקה: ${err.message}`);
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

  const copyLogsToClipboard = (logs: SyncLogEntry[]) => {
    const text = logs.map(l => `[${new Date(l.timestamp).toLocaleTimeString('he-IL')}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'לא בוצעה סריקה מעולם (יסרוק החל מ-10/06/2026)';
    return new Date(dateStr).toLocaleString('he-IL');
  };

  const isSyncing = activeRun?.status === 'running';
  const progressPercent = activeRun && activeRun.total_messages > 0 
    ? Math.min(100, Math.round((activeRun.processed_messages / activeRun.total_messages) * 100))
    : (isSyncing ? 10 : 0);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8 flex items-center gap-3">
        <span className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
        <span className="text-gray-600 text-sm font-medium">טוען הגדרות Gmail...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-7 mb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span>סריקת חשבוניות מ-Gmail</span>
            {config && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                מחובר
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            סריקה אוטומטית ויזומה של חשבוניות ומסמכי הוצאה מתיבת המייל הארגונית
          </p>
        </div>

        {config && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                fetchSyncStatus();
                setShowHistory(!showHistory);
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-colors flex items-center gap-1.5"
            >
              <span>📋</span>
              <span>{showHistory ? 'הסתר היסטוריה' : 'היסטוריית סריקות'}</span>
            </button>
          </div>
        )}
      </div>

      {message && (
        <div className={`p-3.5 mb-5 rounded-xl text-sm flex items-center justify-between transition-all ${
          message.includes('שגיאה') 
            ? 'bg-rose-50 text-rose-800 border border-rose-200' 
            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
        }`}>
          <div className="flex items-center gap-2 font-medium">
            <span>{message.includes('שגיאה') ? '⚠️' : '✅'}</span>
            <span>{message}</span>
          </div>
          <button onClick={() => setMessage('')} className="font-bold text-base px-2 hover:opacity-75 transition-opacity">&times;</button>
        </div>
      )}

      {!config ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
          <p className="mb-4 text-slate-700 text-sm leading-relaxed">
            הזן את כתובת המייל הארגונית שממנה תרצה לייבא חשבוניות. 
            המערכת משתמשת בהרשאות אדמין (Domain-Wide Delegation) עם חשבון שירות מאובטח, ולכן אין צורך בסיסמה או התחברות ידנית.
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5 max-w-lg">
            <input 
              type="email" 
              placeholder="fin@confettix.co.il" 
              className="input flex-1 text-left direction-ltr border border-slate-300 rounded-xl px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={inputEmail}
              onChange={(e) => setInputEmail(e.target.value)}
              dir="ltr"
            />
            <button 
              onClick={handleConnect}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all hover:shadow hover:-translate-y-0.5 active:translate-y-0"
            >
              הגדר תיבה
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Account Details & Checkpoint Card */}
          <div className="bg-gradient-to-br from-blue-50/80 via-indigo-50/40 to-slate-50 border border-blue-200/80 rounded-2xl p-5 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-blue-100/80 pb-4 mb-4">
              <div>
                <span className="text-xs font-bold text-blue-900/70 uppercase tracking-wider block mb-0.5">כתובת תיבה מחוברת</span>
                <span className="text-slate-900 font-extrabold text-lg tracking-tight font-mono">{config.email_address}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-blue-900 bg-white/90 shadow-2xs px-3.5 py-2 rounded-xl border border-blue-200 font-semibold flex items-center gap-2">
                  <span className="text-blue-600 text-sm">⏰</span>
                  <span>סריקה אוטומטית: מדי יום בשעה 03:00 לפנות בוקר</span>
                </div>
              </div>
            </div>
            
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-blue-900/70 uppercase tracking-wider block mb-0.5">נקודת סריקה אחרונה (Checkpoint ב-DB)</span>
                  <span className="text-slate-800 font-semibold text-sm">
                    {formatDate(config.last_sync_at)}
                  </span>
                </div>
                <button
                  onClick={() => setIsEditingCheckpoint(!isEditingCheckpoint)}
                  className="text-xs text-blue-700 hover:text-blue-900 font-semibold underline underline-offset-4 decoration-blue-300 hover:decoration-blue-700 transition-all self-start sm:self-auto"
                >
                  {isEditingCheckpoint ? 'ביטול עריכה' : '✏️ שנה תאריך סריקה'}
                </button>
              </div>

              {isEditingCheckpoint && (
                <div className="mt-3.5 pt-3.5 border-t border-blue-200/60 flex flex-wrap items-center gap-2.5">
                  <span className="text-xs font-medium text-slate-700">קבע תאריך התחלה ל-DB:</span>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={() => handleUpdateCheckpoint()}
                    disabled={updatingCheckpoint}
                    className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 shadow-2xs transition-all disabled:opacity-50"
                  >
                    {updatingCheckpoint ? 'מעדכן...' : 'עדכן תאריך'}
                  </button>
                  <button
                    onClick={() => {
                      setCustomDate('2026-06-10');
                      handleUpdateCheckpoint('2026-06-10');
                    }}
                    disabled={updatingCheckpoint}
                    className="px-3.5 py-1.5 bg-white text-blue-800 rounded-lg text-xs font-semibold hover:bg-blue-50 border border-blue-300 shadow-2xs transition-all disabled:opacity-50"
                  >
                    קבע ל-10/06/2026
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Prominent Action Button Area */}
          <div className="flex flex-wrap items-center gap-4">
            <button 
              onClick={handleManualSync}
              disabled={isSyncing}
              className={`relative group overflow-hidden px-7 py-3.5 rounded-xl font-bold text-sm text-white shadow-md transition-all duration-200 flex items-center gap-3 select-none ${
                isSyncing 
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 opacity-90 cursor-wait' 
                  : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-700 hover:via-indigo-700 hover:to-emerald-700 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md'
              }`}
            >
              {isSyncing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span className="tracking-wide">סריקה מתבצעת ברקע...</span>
                </>
              ) : (
                <>
                  <span className="text-base group-hover:rotate-180 transition-transform duration-500">⚡</span>
                  <span className="tracking-wide">הפעל סריקה יזומה עכשיו</span>
                </>
              )}
            </button>

            <button 
              onClick={handleDisconnect}
              disabled={isSyncing}
              className="px-4 py-3 border border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 font-semibold text-xs rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              נתק תיבה
            </button>
          </div>

          {/* Active Live Progress & Terminal Console */}
          {activeRun && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-xl animate-in fade-in duration-300">
              {/* Terminal Title Bar */}
              <div className="bg-slate-900/90 px-4 py-3 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
                    <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
                    <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
                  </div>
                  <div className="h-4 w-[1px] bg-slate-700 mx-1"></div>
                  <span className="text-xs font-mono font-semibold text-slate-300 flex items-center gap-2">
                    {isSyncing && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                    )}
                    <span>יומן סריקה חי (Live Stream)</span>
                  </span>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    onClick={() => copyLogsToClipboard(activeRun.logs || [])}
                    className="text-2xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition-colors"
                  >
                    {copiedLogs ? '✓ הועתק!' : '📋 העתק לוגים'}
                  </button>
                  <button
                    onClick={() => setActiveRun(null)}
                    className="text-2xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                    title="סגור תצוגה"
                  >
                    ✕ סגור
                  </button>
                </div>
              </div>

              {/* Progress Summary Strip */}
              <div className="px-5 py-3.5 bg-slate-900/50 border-b border-slate-800/80 flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between text-xs gap-2">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-slate-400">סטטוס:</span>
                    <span className={`font-bold ${
                      activeRun.status === 'running' 
                        ? 'text-amber-400 animate-pulse' 
                        : activeRun.status === 'completed' 
                        ? 'text-emerald-400' 
                        : 'text-rose-400'
                    }`}>
                      {activeRun.status === 'running' ? 'סורק ומעבד מיילים...' : activeRun.status === 'completed' ? 'סריקה הושלמה בהצלחה' : 'נכשל'}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-slate-300 font-mono text-xs">
                    {activeRun.total_messages > 0 && (
                      <span>הודעות: <strong className="text-white">{activeRun.processed_messages}/{activeRun.total_messages}</strong></span>
                    )}
                    <span>נוספו: <strong className="text-emerald-400">+{activeRun.new_invoices_count}</strong></span>
                    {activeRun.started_at && (
                      <span className="text-slate-400 text-2xs">
                        החלה ב: {new Date(activeRun.started_at).toLocaleTimeString('he-IL')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                {isSyncing && (
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    ></div>
                  </div>
                )}

                {/* Current step text */}
                <div className="text-2xs text-slate-400 font-mono truncate">
                  ⚡ {activeRun.current_step || 'ממתין לפעולה...'}
                </div>
              </div>

              {/* Terminal Logs Output */}
              <div 
                ref={logTerminalRef}
                className="p-4 max-h-72 overflow-y-auto font-mono text-xs space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700 select-text"
                dir="rtl"
              >
                {activeRun.logs && activeRun.logs.length > 0 ? (
                  activeRun.logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2.5 leading-relaxed">
                      <span className="text-slate-500 text-2xs whitespace-nowrap select-none font-sans pt-0.5">
                        {new Date(log.timestamp).toLocaleTimeString('he-IL')}
                      </span>
                      
                      <span className={`px-1.5 py-0.2 rounded text-2xs font-bold uppercase tracking-wider select-none shrink-0 ${
                        log.level === 'success' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' :
                        log.level === 'warn' ? 'bg-amber-950 text-amber-300 border border-amber-800/60' :
                        log.level === 'error' ? 'bg-rose-950 text-rose-300 border border-rose-800/60' :
                        'bg-blue-950 text-blue-300 border border-blue-800/60'
                      }`}>
                        {log.level === 'success' ? 'הצלחה' : log.level === 'warn' ? 'דילוג' : log.level === 'error' ? 'שגיאה' : 'מידע'}
                      </span>

                      <span className={`flex-1 break-words ${
                        log.level === 'success' ? 'text-emerald-300 font-medium' :
                        log.level === 'warn' ? 'text-amber-200/90' :
                        log.level === 'error' ? 'text-rose-300 font-semibold' :
                        'text-slate-200'
                      }`}>
                        {log.message}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 italic">אין עדיין רשומות יומן להצגה...</div>
                )}
              </div>
            </div>
          )}

          {/* Sync History Drawer */}
          {showHistory && (
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/80 animate-in fade-in duration-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <span>📜</span>
                  <span>היסטוריית סריקות אחרונות</span>
                </h3>
                <span className="text-xs text-slate-500">5 סריקות אחרונות שנרשמו ב-DB</span>
              </div>

              {recentRuns.length === 0 ? (
                <div className="text-xs text-slate-500 p-4 text-center bg-white rounded-xl border border-dashed border-slate-200">
                  לא נמצאו סריקות קודמות מתועדות במערכת.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recentRuns.map((run) => (
                    <div 
                      key={run.id}
                      className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-blue-300 transition-all shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                          run.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          run.status === 'failed' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                          'bg-amber-50 text-amber-700 border border-amber-200 animate-spin'
                        }`}>
                          {run.status === 'completed' ? '✓' : run.status === 'failed' ? '✗' : '↻'}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {new Date(run.started_at).toLocaleString('he-IL')}
                            </span>
                            <span className="text-2xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                              {run.trigger_type === 'cron' ? '🤖 אוטומטי (Cron)' : '👤 יזום ידני'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 font-medium">
                            {run.status === 'completed' 
                              ? `נוספו ${run.new_invoices_count} חשבוניות חדשות (נסרקו ${run.total_messages} מיילים)` 
                              : run.error_message || 'נכשל'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() => {
                            setActiveRun(run);
                            if (logTerminalRef.current) {
                              logTerminalRef.current.scrollIntoView({ behavior: 'smooth' });
                            }
                          }}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-colors"
                        >
                          הצג לוג מלא
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer details */}
          <div className="pt-2 text-xs text-slate-400 space-y-1">
            <p>
              💡 <strong>כיצד זה עובד?</strong> כל סריקה יזומה או אוטומטית שולפת מיילים עם קבצי PDF ותמונות שנוצרו אחרי תאריך ה-Checkpoint האחרון, מפענחת אותם ב-OCR ו-AI, מזהה ספקים וסכומים, מעלה את הקובץ ל-Google Drive, ויוצרת רשומת חשבונית במערכת.
            </p>
            <p>
              ⚡ <strong>יציאה מהחלון:</strong> הסריקה מבוצעת לחלוטין ברקע בשרת. גם אם תעבור לעמוד אחר או תסגור את הדפדפן, הסריקה תמשיך לרוץ והתוצאות יתועדו במלואן.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
