'use client';

import { useState, useEffect, useRef } from 'react';
import { SyncRunState, SyncLogEntry } from '@/lib/gmail/tracker';

interface SyncConfig {
  email_address: string;
  last_sync_at: string | null;
  auto_scan_day_of_month?: number;
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

  // Auto-scan settings
  const [isEditingAutoScan, setIsEditingAutoScan] = useState(false);
  const [autoScanDay, setAutoScanDay] = useState<number>(1);
  const [updatingAutoScan, setUpdatingAutoScan] = useState(false);

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
          setAutoScanDay(data.auto_scan_day_of_month || 1);
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
        
        // If an active run just finished, refresh config
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
        body: JSON.stringify({ email_address: inputEmail.trim(), auto_scan_day_of_month: 1 })
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

  const handleUpdateAutoScanDay = async () => {
    setUpdatingAutoScan(true);
    try {
      const res = await fetch('/api/import/gmail/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_scan_day_of_month: autoScanDay })
      });

      if (res.ok) {
        setMessage(`יום סריקה אוטומטית עודכן ל-${autoScanDay} בחודש.`);
        setIsEditingAutoScan(false);
        fetchConfig();
      } else {
        const err = await res.json();
        setMessage(`שגיאה בעדכון יום סריקה: ${err.error}`);
      }
    } catch (err: any) {
      setMessage(`שגיאה בעדכון: ${err.message}`);
    } finally {
      setUpdatingAutoScan(false);
    }
  };

  const copyLogsToClipboard = (logs: SyncLogEntry[]) => {
    const text = logs.map(l => `[${new Date(l.timestamp).toLocaleTimeString('he-IL')}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const formatDateTime = (dateStr: string | null | undefined) => {
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

  const actualLastRun = recentRuns.length > 0 ? recentRuns[0] : null;

  // The last scan date to show (prioritize history run, fallback to config.last_sync_at)
  const lastScanDateToShow = actualLastRun ? actualLastRun.started_at : config?.last_sync_at;

  if (loading) {
    return (
      <div className="card" style={{ padding: 'var(--space-8)', marginBottom: 'var(--space-8)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)' }}>
        <span style={{ fontSize: '1.5rem' }}>⏳</span>
        <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>טוען הגדרות Gmail...</span>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 'var(--space-8)', overflow: 'hidden', padding: 0 }}>
      {/* Header */}
      <div style={{
        padding: 'var(--space-5) var(--space-6)',
        borderBottom: '1px solid var(--color-glass-border)',
        background: 'var(--color-bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 'var(--space-3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--color-accent-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem'
          }}>
            📬
          </div>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
              סריקת חשבוניות מ-Gmail
            </h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', margin: '2px 0 0 0' }}>
              ייבוא וסריקה אוטומטית ויזומה של חשבוניות ומסמכי הוצאה מתיבת המייל
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: 'var(--space-6)' }}>
        {message && (
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            marginBottom: 'var(--space-6)',
            borderRadius: 'var(--radius-lg)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: message.includes('שגיאה') ? 'var(--color-error-muted)' : 'var(--color-success-muted)',
            border: `1px solid ${message.includes('שגיאה') ? 'var(--color-error)' : 'var(--color-success)'}`,
            color: message.includes('שגיאה') ? 'var(--color-error)' : 'var(--color-success)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span>{message.includes('שגיאה') ? '⚠️' : '✅'}</span>
              <span>{message}</span>
            </div>
            <button onClick={() => setMessage('')} style={{ fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer', padding: '0 var(--space-2)' }}>✕</button>
          </div>
        )}

        {!config ? (
          <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center', padding: 'var(--space-6) 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>🔒</div>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>חיבור תיבת מייל ארגונית</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6, marginBottom: 'var(--space-6)' }}>
              הזן את כתובת המייל הארגונית שממנה תרצה לייבא חשבוניות. המערכת תסרוק אוטומטית הודעות עם קבצי PDF ותמונות באמצעות הרשאות מאובטחות ברקע.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
              <input 
                type="email" 
                placeholder="fin@yourcompany.com" 
                style={{ flex: 1, minWidth: '240px', maxWidth: '350px', direction: 'ltr', textAlign: 'left' }}
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
              />
              <button 
                onClick={handleConnect}
                className="btn btn-primary"
                style={{ padding: 'var(--space-3) var(--space-6)', fontWeight: 700 }}
              >
                התחבר עכשיו
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 'var(--space-8)',
            alignItems: 'start'
          }}>
            
            {/* RIGHT COLUMN (Actions, Account, Settings) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              
              {/* Connected Email Header with Disconnect Button */}
              <div style={{
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-glass-border)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-4) var(--space-5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 'var(--space-4)'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: '4px' }}>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      כתובת תיבה מחוברת
                    </div>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      background: 'var(--color-success-muted)',
                      border: '1px solid var(--color-success)',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      color: 'var(--color-success)'
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block' }}></span>
                      פעיל
                    </div>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>
                    {config.email_address}
                  </div>
                </div>

                <button 
                  onClick={handleDisconnect}
                  disabled={isSyncing}
                  className="btn btn-danger"
                  style={{
                    padding: 'var(--space-2) var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 600,
                    fontSize: 'var(--font-size-sm)',
                    opacity: isSyncing ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>🔌</span>
                  <span>נתק תיבה</span>
                </button>
              </div>

              {/* Action Buttons */}
              <button 
                onClick={handleManualSync}
                disabled={isSyncing}
                style={{
                  width: '100%',
                  padding: 'var(--space-4) var(--space-6)',
                  borderRadius: 'var(--radius-xl)',
                  background: isSyncing ? '#3b82f6' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: 'var(--font-size-lg)',
                  border: 'none',
                  cursor: isSyncing ? 'wait' : 'pointer',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--space-3)',
                  transition: 'all var(--transition-fast)'
                }}
              >
                {isSyncing ? (
                  <>
                    <span style={{ fontSize: '1.4rem', display: 'inline-block', animation: 'spin 1s linear infinite' }}>↻</span>
                    <span>סריקה מתבצעת ברקע...</span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '1.4rem' }}>⚡</span>
                    <span>הפעל סריקה יזומה</span>
                  </>
                )}
              </button>

              {/* Settings Fields (Auto-scan + Last Scan) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                {/* Auto Scan Field */}
                <div style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-glass-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-4)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      <span>⏰</span>
                      <span>סריקה אוטומטית (חודשית)</span>
                    </div>
                    <button
                      onClick={() => setIsEditingAutoScan(!isEditingAutoScan)}
                      style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-accent)', fontWeight: 700, textDecoration: 'underline' }}
                    >
                      {isEditingAutoScan ? 'ביטול' : 'שנה מועד'}
                    </button>
                  </div>

                  {!isEditingAutoScan ? (
                    <div style={{ background: 'var(--color-bg-primary)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-glass-border)' }}>
                      <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        ב-{config.auto_scan_day_of_month || 1} לכל חודש (03:00)
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <span style={{ fontSize: 'var(--font-size-xs)' }}>יום בחודש:</span>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={autoScanDay}
                          onChange={(e) => setAutoScanDay(parseInt(e.target.value) || 1)}
                          style={{ fontSize: 'var(--font-size-sm)', padding: 'var(--space-1) var(--space-2)', width: '60px', textAlign: 'center' }}
                        />
                      </div>
                      <button
                        onClick={handleUpdateAutoScanDay}
                        disabled={updatingAutoScan}
                        className="btn btn-primary btn-sm"
                        style={{ width: '100%', fontWeight: 700 }}
                      >
                        {updatingAutoScan ? 'שומר...' : 'שמור שינויים'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Last Scan Date Field (Replaced Checkpoint) */}
                <div style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-glass-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-4)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-2)' }}>
                    <span>📅</span>
                    <span>תאריך סריקה אחרונה</span>
                  </div>
                  
                  <div style={{ background: 'var(--color-bg-primary)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-glass-border)' }}>
                    <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {formatDateTime(lastScanDateToShow)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                      הסריקה כוללת יזומה ואוטומטית
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Terminal / Live Stream */}
              {activeRun && (
                <div style={{
                  background: '#090d16',
                  borderRadius: 'var(--radius-xl)',
                  border: '1px solid #1e293b',
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow-xl)'
                }}>
                  <div style={{
                    background: '#0f172a',
                    padding: 'var(--space-3) var(--space-4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #1e293b'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }}></span>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
                      <span style={{ color: '#cbd5e1', fontSize: 'var(--font-size-xs)', fontFamily: 'monospace', fontWeight: 700, marginRight: 'var(--space-2)' }}>
                        יומן סריקה חי (Live Stream)
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <button
                        onClick={() => copyLogsToClipboard(activeRun.logs || [])}
                        style={{ color: '#94a3b8', fontSize: '0.7rem', padding: '2px 8px', background: '#1e293b', borderRadius: 'var(--radius-sm)' }}
                      >
                        {copiedLogs ? '✓ הועתק!' : '📋 העתק'}
                      </button>
                      <button
                        onClick={() => setActiveRun(null)}
                        style={{ color: '#94a3b8', fontSize: '0.8rem', padding: '2px 6px', background: '#1e293b', borderRadius: 'var(--radius-sm)' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'rgba(15, 23, 42, 0.6)', borderBottom: '1px solid #1e293b', fontSize: 'var(--font-size-xs)', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      סטטוס: <strong style={{ color: activeRun.status === 'running' ? '#fbbf24' : activeRun.status === 'completed' ? '#4ade80' : '#f87171' }}>{activeRun.status}</strong>
                    </span>
                    <span>הודעות: <strong style={{ color: '#ffffff' }}>{activeRun.processed_messages}/{activeRun.total_messages}</strong></span>
                  </div>

                  {isSyncing && (
                    <div style={{ width: '100%', height: '4px', background: '#1e293b' }}>
                      <div style={{ width: `${progressPercent}%`, height: '100%', background: '#3b82f6', transition: 'width 0.3s ease' }}></div>
                    </div>
                  )}

                  <div 
                    ref={logTerminalRef}
                    style={{
                      padding: 'var(--space-4)',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      color: '#e2e8f0',
                      direction: 'rtl'
                    }}
                  >
                    {activeRun.logs && activeRun.logs.length > 0 ? (
                      activeRun.logs.map((log) => (
                        <div key={log.id} style={{ display: 'flex', gap: 'var(--space-2)', lineHeight: 1.4 }}>
                          <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{new Date(log.timestamp).toLocaleTimeString('he-IL')}</span>
                          <span style={{
                            fontWeight: 700,
                            color: log.level === 'success' ? '#4ade80' : log.level === 'warn' ? '#fbbf24' : log.level === 'error' ? '#f87171' : '#60a5fa'
                          }}>
                            [{log.level.toUpperCase()}]
                          </span>
                          <span>{log.message}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: '#64748b', fontStyle: 'italic' }}>ממתין לפעולות...</div>
                    )}
                  </div>
                </div>
              )}

              {/* How it works Accordion */}
              <div style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-glass-border)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden'
              }}>
                <button 
                  onClick={() => setIsHowItWorksOpen(!isHowItWorksOpen)}
                  style={{
                    width: '100%',
                    padding: 'var(--space-4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textAlign: 'right',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-primary)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span>💡</span>
                    <span>כיצד הסריקה עובדת?</span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    {isHowItWorksOpen ? '▲' : '▼'}
                  </span>
                </button>
                
                {isHowItWorksOpen && (
                  <div style={{
                    padding: '0 var(--space-4) var(--space-4) var(--space-4)',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.6,
                    borderTop: '1px solid var(--color-glass-border)'
                  }}>
                    <ul style={{ margin: 'var(--space-3) 0 0 0', paddingRight: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <li><strong>זיהוי קבצים:</strong> המערכת מחפשת באופן אוטומטי מיילים המכילים חשבוניות, קבלות וקבצי PDF או תמונות.</li>
                      <li><strong>פענוח חכם (AI):</strong> כל קובץ שנסרק מועבר למערכת OCR ובינה מלאכותית המזהה אוטומטית את הספק, התאריך והסכום.</li>
                      <li><strong>סריקה ברקע:</strong> התהליך מתבצע במלואו בענן. גם אם תסגור את החלון או תכבה את המחשב, הסריקה תמשיך לרוץ והחשבוניות יעודכנו במערכת.</li>
                    </ul>
                  </div>
                )}
              </div>

            </div>

            {/* LEFT COLUMN (History Table) */}
            <div style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-glass-border)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-5)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📜</span>
                  <span>היסטוריית סריקות</span>
                </h3>
              </div>

              {recentRuns.length === 0 ? (
                <div style={{
                  padding: 'var(--space-8) var(--space-4)',
                  textAlign: 'center',
                  background: 'var(--color-bg-primary)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px dashed var(--color-glass-border)'
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>📋</div>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-tertiary)' }}>
                    טרם בוצעו סריקות במערכת
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '6px' }}>
                    לחץ על סריקה יזומה או המתן לסריקה האוטומטית הבאה. כאן יופיעו פרטי הסריקות, כמה חשבוניות נמצאו, וסטטוס ההצלחה.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {recentRuns.map((run) => (
                    <div 
                      key={run.id}
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--color-bg-primary)',
                        border: '1px solid var(--color-glass-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--space-3)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '0.9rem',
                          background: run.status === 'completed' ? 'var(--color-success-muted)' : run.status === 'failed' ? 'var(--color-error-muted)' : 'var(--color-warning-muted)',
                          color: run.status === 'completed' ? 'var(--color-success)' : run.status === 'failed' ? 'var(--color-error)' : 'var(--color-warning)'
                        }}>
                          {run.status === 'completed' ? '✓' : run.status === 'failed' ? '✗' : '↻'}
                        </div>
                        <div>
                          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            {formatDateTime(run.started_at)}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                            {run.trigger_type === 'cron' ? '🤖 סריקה אוטומטית' : '👤 סריקה יזומה'}
                          </div>
                        </div>
                      </div>

                      <div style={{
                        textAlign: 'center',
                        background: 'var(--color-bg-tertiary)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-sm)',
                        minWidth: '50px'
                      }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>חשבוניות</div>
                        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 800, color: 'var(--color-accent)' }}>+{run.new_invoices_count}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
