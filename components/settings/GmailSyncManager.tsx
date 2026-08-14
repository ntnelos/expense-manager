'use client';

import { useState, useEffect, useRef } from 'react';
import { SyncRunState, SyncLogEntry } from '@/lib/gmail/tracker';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

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
  const [copiedLogs, setCopiedLogs] = useState(false);

  // Checkpoint editing
  const [isEditingCheckpoint, setIsEditingCheckpoint] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [updatingCheckpoint, setUpdatingCheckpoint] = useState(false);

  // Accordion state
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);

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
    setMessage('');
    try {
      // Start polling immediately so progress updates appear instantly
      fetchSyncStatus();

      const pollTimer = setInterval(() => {
        fetchSyncStatus();
      }, 1000);

      const res = await fetch('/api/import/gmail/sync', { method: 'POST' });
      const data = await res.json();
      
      clearInterval(pollTimer);
      fetchSyncStatus();
      fetchConfig();

      if (res.ok) {
        if (data.alreadyRunning) {
          setMessage('סריקה כבר מתבצעת כעת ברקע...');
        } else {
          setMessage(`הסריקה הסתיימה בהצלחה! נקלטו ${data.count ?? 0} חשבוניות חדשות.`);
        }
      } else {
        setMessage(`שגיאה בסריקה: ${data.error || data.message}`);
      }
    } catch (err: any) {
      fetchSyncStatus();
      fetchConfig();
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
        setMessage(`תאריך חילוץ החשבוניות (Checkpoint) עודכן בהצלחה ב-DB ל-${new Date(isoDate).toLocaleDateString('he-IL')}.`);
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
    if (!dateStr) return 'לא נבחר תאריך';
    return new Date(dateStr).toLocaleDateString('he-IL');
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'מעולם לא';
    return new Date(dateStr).toLocaleString('he-IL', { 
      day: '2-digit', month: '2-digit', year: 'numeric', 
      hour: '2-digit', minute: '2-digit'
    });
  };

  const isSyncing = activeRun?.status === 'running';
  const progressPercent = activeRun && activeRun.total_messages > 0 
    ? Math.min(100, Math.round((activeRun.processed_messages / activeRun.total_messages) * 100))
    : (isSyncing ? 10 : 0);

  // Find the actual last run to show to the user
  const actualLastRun = recentRuns.length > 0 ? recentRuns[0] : null;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-8 flex items-center justify-center gap-3 h-64">
        <span className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
        <span className="text-gray-600 font-medium text-lg">טוען הגדרות Gmail...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-200 mb-8 overflow-hidden">
      {/* Minimal Header */}
      <div className="bg-slate-50 border-b border-gray-200 p-6 sm:px-8">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <span className="bg-blue-100 text-blue-600 p-2 rounded-xl">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </span>
          סריקת חשבוניות מ-Gmail
        </h2>
      </div>

      <div className="p-6 sm:p-8">
        {message && (
          <div className={`p-4 mb-8 rounded-xl text-sm font-medium flex items-center justify-between transition-all ${
            message.includes('שגיאה') 
              ? 'bg-red-50 text-red-800 border border-red-200' 
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-xl">{message.includes('שגיאה') ? '⚠️' : '✅'}</span>
              <span>{message}</span>
            </div>
            <button onClick={() => setMessage('')} className="text-lg hover:opacity-75 p-1">&times;</button>
          </div>
        )}

        {!config ? (
          <div className="max-w-2xl mx-auto text-center py-8">
            <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">חיבור תיבת מייל ארגונית</h3>
            <p className="text-gray-500 mb-8 leading-relaxed max-w-lg mx-auto">
              הזן את כתובת המייל הארגונית שממנה תרצה לייבא חשבוניות. המערכת תסרוק אוטומטית הודעות עם קבצי PDF ותמונות באמצעות הרשאות מאובטחות ברקע.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input 
                type="email" 
                placeholder="fin@yourcompany.com" 
                className="input flex-1 text-left direction-ltr border-2 border-gray-200 rounded-xl px-4 py-3 text-base bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all outline-none"
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
                dir="ltr"
              />
              <button 
                onClick={handleConnect}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition-all"
              >
                התחבר עכשיו
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            
            {/* RIGHT COLUMN (Actions & Settings) */}
            <div className="lg:col-span-7 flex flex-col gap-8">
              
              {/* Connected Email Header */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50/30 border border-blue-100 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-blue-600 mb-1 uppercase tracking-wide">כתובת תיבה מחוברת</div>
                  <div className="text-2xl font-black text-gray-900 tracking-tight font-mono">{config.email_address}</div>
                </div>
                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-blue-100">
                  <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-bold text-gray-700">מחובר ופעיל</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className={`flex-1 relative overflow-hidden px-6 py-4 rounded-2xl font-black text-lg text-white shadow-xl transition-all duration-300 flex items-center justify-center gap-3 ${
                    isSyncing 
                      ? 'bg-blue-500 opacity-90 cursor-wait' 
                      : 'bg-blue-600 hover:bg-blue-700 hover:-translate-y-1 hover:shadow-blue-500/30'
                  }`}
                >
                  {isSyncing ? (
                    <>
                      <span className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>סריקה מתבצעת ברקע...</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>הפעל סריקה יזומה</span>
                    </>
                  )}
                </button>

                <button 
                  onClick={handleDisconnect}
                  disabled={isSyncing}
                  className="px-6 py-4 bg-red-50 hover:bg-red-100 border-2 border-red-200 text-red-600 rounded-2xl font-bold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>נתק תיבה</span>
                </button>
              </div>

              {/* Settings Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Auto Scan Field */}
                <div className="border border-gray-200 rounded-2xl p-5 hover:border-gray-300 transition-colors bg-white shadow-sm">
                  <div className="flex items-center gap-2 text-gray-800 font-bold mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    סריקה אוטומטית
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="font-semibold text-gray-700 text-sm">מדי יום (03:00)</span>
                    <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded-md">פעיל</span>
                  </div>
                </div>

                {/* Checkpoint Field */}
                <div className="border border-gray-200 rounded-2xl p-5 hover:border-gray-300 transition-colors bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-gray-800 font-bold">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      נקודת התחלה
                    </div>
                    <button
                      onClick={() => setIsEditingCheckpoint(!isEditingCheckpoint)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      {isEditingCheckpoint ? 'ביטול' : 'שנה תאריך'}
                    </button>
                  </div>

                  {!isEditingCheckpoint ? (
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                      <div className="font-semibold text-gray-700 text-sm">{formatDate(config.last_sync_at)}</div>
                      <div className="text-xs text-gray-500 mt-0.5">המערכת תסרוק מיילים החל מתאריך זה</div>
                    </div>
                  ) : (
                    <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 flex flex-col gap-2">
                      <input
                        type="date"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <button
                        onClick={() => handleUpdateCheckpoint()}
                        disabled={updatingCheckpoint}
                        className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                      >
                        {updatingCheckpoint ? 'שומר...' : 'שמור שינויים'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Live Progress & Terminal Console */}
              {activeRun && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl animate-in fade-in duration-300 transform scale-100">
                  <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-300">Live Console</span>
                    </div>
                    <button onClick={() => setActiveRun(null)} className="text-slate-400 hover:text-white transition-colors">
                      ✕
                    </button>
                  </div>
                  
                  <div className="p-4 bg-slate-900/50 border-b border-slate-800/80">
                    <div className="flex justify-between text-xs mb-2">
                      <span className="font-mono text-slate-300">
                        סטטוס: <span className={activeRun.status === 'running' ? 'text-amber-400 font-bold' : activeRun.status === 'completed' ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>{activeRun.status}</span>
                      </span>
                      <span className="font-mono text-slate-400">{activeRun.processed_messages}/{activeRun.total_messages}</span>
                    </div>
                    {isSyncing && (
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-blue-500 h-full rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
                      </div>
                    )}
                  </div>

                  <div ref={logTerminalRef} className="p-4 max-h-60 overflow-y-auto font-mono text-xs space-y-2" dir="rtl">
                    {activeRun.logs && activeRun.logs.length > 0 ? (
                      activeRun.logs.map((log) => (
                        <div key={log.id} className="flex gap-2">
                          <span className="text-slate-600 shrink-0">{new Date(log.timestamp).toLocaleTimeString('he-IL')}</span>
                          <span className={`shrink-0 font-bold ${log.level === 'success' ? 'text-green-400' : log.level === 'warn' ? 'text-yellow-400' : log.level === 'error' ? 'text-red-400' : 'text-blue-400'}`}>[{log.level.toUpperCase()}]</span>
                          <span className="text-slate-300">{log.message}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-600 italic">ממתין לפעולות...</div>
                    )}
                  </div>
                </div>
              )}

              {/* How it works Accordion */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <button 
                  onClick={() => setIsHowItWorksOpen(!isHowItWorksOpen)}
                  className="w-full flex items-center justify-between p-5 text-right hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className="font-bold text-gray-900 text-base">כיצד הסריקה עובדת?</span>
                  </div>
                  {isHowItWorksOpen ? (
                    <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                  )}
                </button>
                
                {isHowItWorksOpen && (
                  <div className="p-5 pt-0 text-sm text-gray-600 leading-relaxed bg-white border-t border-gray-100">
                    <ul className="space-y-3 mt-3">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 mt-0.5">•</span>
                        <span><strong>זיהוי קבצים:</strong> המערכת מחפשת באופן אוטומטי מיילים המכילים חשבוניות, קבלות וקבצי PDF או תמונות.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 mt-0.5">•</span>
                        <span><strong>פענוח חכם (AI):</strong> כל קובץ שנסרק מועבר למערכת OCR ובינה מלאכותית המזהה אוטומטית את הספק, התאריך והסכום.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500 mt-0.5">•</span>
                        <span><strong>סריקה ברקע:</strong> התהליך מתבצע במלואו בענן. גם אם תסגור את החלון או תכבה את המחשב, הסריקה תמשיך לרוץ והחשבוניות יעודכנו במערכת.</span>
                      </li>
                    </ul>
                  </div>
                )}
              </div>

            </div>

            {/* LEFT COLUMN (History Table) */}
            <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-r border-gray-200 pt-8 lg:pt-0 lg:pr-10">
              <div className="flex flex-col h-full">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    היסטוריית סריקות
                  </h3>
                  
                  {actualLastRun && (
                    <div className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                      סריקה אחרונה: {formatDateTime(actualLastRun.started_at)}
                    </div>
                  )}
                </div>

                {recentRuns.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-center">
                    <div className="w-12 h-12 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mb-3">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-500">טרם בוצעו סריקות במערכת</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentRuns.map((run) => (
                      <div 
                        key={run.id}
                        className={`p-4 rounded-2xl border ${run.status === 'completed' ? 'border-green-100 bg-green-50/30' : run.status === 'failed' ? 'border-red-100 bg-red-50/30' : 'border-blue-100 bg-blue-50/30'} flex flex-col gap-3 transition-colors hover:shadow-sm`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                                run.status === 'completed' ? 'bg-green-100 text-green-600' :
                                run.status === 'failed' ? 'bg-red-100 text-red-600' :
                                'bg-blue-100 text-blue-600 animate-pulse'
                            }`}>
                              {run.status === 'completed' ? '✓' : run.status === 'failed' ? '✗' : '↻'}
                            </div>
                            <div>
                              <div className="font-bold text-gray-900 text-sm">{formatDateTime(run.started_at)}</div>
                              <div className="text-xs font-semibold text-gray-500 mt-0.5">
                                {run.trigger_type === 'cron' ? 'סריקה אוטומטית' : 'סריקה יזומה (ידני)'}
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-center bg-white px-3 py-1.5 rounded-lg border border-gray-100 shadow-sm">
                            <div className="text-xs text-gray-500 font-medium mb-0.5">חשבוניות</div>
                            <div className="font-bold text-gray-900 leading-none">+{run.new_invoices_count}</div>
                          </div>
                        </div>

                        {run.status === 'failed' && run.error_message && (
                          <div className="text-xs text-red-600 bg-red-50 p-2 rounded-lg mt-1 font-medium">
                            שגיאה: {run.error_message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
