'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Invoice, ExpenseLine } from '@/lib/supabase/types';
import { formatToIsraeliDate } from '@/lib/utils/dates';
import InvoiceDetailPanel from './InvoiceDetailPanel';
import AutoMatchModal from './AutoMatchModal';
import ApproveNoInvoiceModal from '../expense-lines/ApproveNoInvoiceModal';
import ApproveNoExpenseModal from '../invoices/ApproveNoExpenseModal';
import DirectUploadModal from '../invoices/DirectUploadModal';
import DeleteExpenseModal from '../expense-lines/DeleteExpenseModal';
import NoteModal from '../expense-lines/NoteModal';

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(amount);
}

type SortField = 'date' | 'amount' | 'name';
type SortDirection = 'asc' | 'desc';

/** Simple Levenshtein-based similarity (0-1) for fuzzy name matching */
function nameSimilarity(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const sa = a.toLowerCase().trim();
  const sb = b.toLowerCase().trim();
  if (sa === sb) return 1;
  if (sa.includes(sb) || sb.includes(sa)) return 0.8;
  // Quick token overlap
  const tokensA = sa.split(/\s+/);
  const tokensB = sb.split(/\s+/);
  let hits = 0;
  for (const t of tokensA) {
    if (t.length > 2 && tokensB.some(tb => tb.includes(t) || t.includes(tb))) hits++;
  }
  const maxLen = Math.max(tokensA.length, tokensB.length);
  return maxLen > 0 ? hits / maxLen : 0;
}

export default function MatchingArena() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenseLines, setExpenseLines] = useState<ExpenseLine[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedInvoices, setSelectedInvoices] = useState<Invoice[]>([]);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [matchingLineId, setMatchingLineId] = useState<string | null>(null);

  // Sorting state
  const [invSort, setInvSort] = useState<{ field: SortField, dir: SortDirection }>({ field: 'date', dir: 'asc' });
  const [lineSort, setLineSort] = useState<{ field: SortField, dir: SortDirection }>({ field: 'date', dir: 'asc' });

  // Filter: default to pending
  type LineFilter = 'all' | 'pending' | 'matched';
  const [lineFilter, setLineFilter] = useState<LineFilter>('pending');

  // Quick search
  const [lineSearch, setLineSearch] = useState('');
  const [invSearch, setInvSearch] = useState('');

  // Auto-Match modal state
  const [showAutoMatch, setShowAutoMatch] = useState(false);

  // Approve without invoice state
  const [approvingLine, setApprovingLine] = useState<ExpenseLine | null>(null);

  // Deleting line state
  const [deletingLine, setDeletingLine] = useState<ExpenseLine | null>(null);

  // Approve invoice without expense state
  const [approvingInvoice, setApprovingInvoice] = useState<Invoice | null>(null);

  // Direct upload for a line
  const [uploadingLine, setUploadingLine] = useState<ExpenseLine | null>(null);

  // Note modal
  const [noteLine, setNoteLine] = useState<ExpenseLine | null>(null);

  // Month selector
  const [chargeMonth, setChargeMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  });

  const fetchUnmatchedData = useCallback(async (silent: boolean = false) => {
    try {
      if (!silent) setLoading(true);
      const invRes = await fetch('/api/invoices?status=new,error&limit=10000');
      const invData = await invRes.json();

      const expRes = await fetch(`/api/expense-lines?chargeMonth=${chargeMonth}&limit=1000`);
      const expData = await expRes.json();

      if (invRes.ok) setInvoices(invData.invoices || []);
      if (expRes.ok) setExpenseLines(expData.expenseLines || []);
    } catch (err) {
      console.error('Failed to fetch data for matching arena', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [chargeMonth]);

  useEffect(() => {
    fetchUnmatchedData(false);
  }, [fetchUnmatchedData]);

  const getMatchScore = (invoicesToMatch: Invoice[], line: ExpenseLine) => {
    let score = 0;
    if (invoicesToMatch.length === 0 || !line.amount) return 0;

    const totalInvAmount = invoicesToMatch.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    const diffAmount = Math.abs(totalInvAmount - line.amount);
    
    if (diffAmount === 0) score += 75;
    else if (diffAmount <= 5) score += 20;

    if (line.transaction_date) {
      const lineDate = new Date(line.transaction_date).getTime();
      let bestDateScore = 0;
      for (const inv of invoicesToMatch) {
        if (inv.invoice_date) {
          const invDate = new Date(inv.invoice_date).getTime();
          const diffDays = Math.abs(invDate - lineDate) / (1000 * 3600 * 24);
          let dateScore = 0;
          if (diffDays === 0) dateScore = 50;
          else if (diffDays <= 3) dateScore = 30;
          else if (diffDays <= 7) dateScore = 10;
          if (dateScore > bestDateScore) bestDateScore = dateScore;
        }
      }
      score += bestDateScore;
    }

    // Fuzzy name matching: boost similar supplier/description names
    for (const inv of invoicesToMatch) {
      const sim = nameSimilarity(inv.supplier_name, line.description);
      if (sim >= 0.8) score += 30;
      else if (sim >= 0.4) score += 15;
      else if (sim > 0) score += 5;
    }

    return score;
  };

  const handleMatch = async (invoiceId: string, lineId: string, matchedAmount: number, matchType: string = 'manual', skipFetch: boolean = false) => {
    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoiceId,
          expense_line_id: lineId,
          matched_amount: matchedAmount,
          match_type: matchType
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to match');
      }

      if (!skipFetch) fetchUnmatchedData(true);
    } catch (err: any) {
      throw err;
    }
  };

  const handleManualMatch = async (line: ExpenseLine) => {
    if (selectedInvoices.length === 0) return;
    setMatchingLineId(line.id);
    try {
      for (const inv of selectedInvoices) {
        await handleMatch(inv.id, line.id, inv.total_amount || line.amount, 'manual', true);
      }
      fetchUnmatchedData(true);
      setSelectedInvoices([]);
    } catch (err: any) {
      alert(err.message || 'שגיאה בביצוע ההתאמה');
    } finally {
      setMatchingLineId(null);
    }
  };

  const handleAutoMatchConfirm = async (proposals: any[]) => {
    for (const p of proposals) {
      try {
        await handleMatch(p.invoice.id, p.line.id, p.invoice.total_amount || p.line.amount, p.score >= 100 ? 'auto_exact' : 'auto_tolerance', true);
      } catch (err: any) {
        console.error('Auto match failed for', p, err);
      }
    }
    fetchUnmatchedData(true);
    setShowAutoMatch(false);
  };

  const handleDeleteLineClick = (line: ExpenseLine, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingLine(line);
  };

  const handleConfirmDelete = async (ignoreFuture: boolean) => {
    if (!deletingLine) return;
    try {
      if (ignoreFuture && deletingLine.description) {
        await fetch('/api/ignored-expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: deletingLine.description })
        });
      }

      const res = await fetch(`/api/expense-lines/${deletingLine.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete expense line');

      setExpenseLines(prev => prev.filter(l => l.id !== deletingLine.id));
      alert('שורת ההוצאה נמחקה בהצלחה.');
    } catch (error) {
      console.error(error);
      alert('שגיאה במחיקת השורה.');
    } finally {
      setDeletingLine(null);
    }
  };

  const handleConfirmApproveNoInvoice = async (note: string) => {
    if (!approvingLine) return;
    try {
      const res = await fetch(`/api/expense-lines`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: approvingLine.id,
          status: 'approved_no_invoice',
          approval_note: note
        })
      });
      if (!res.ok) throw new Error('Failed to approve');

      fetchUnmatchedData(true);
    } catch (error) {
      console.error(error);
      alert('שגיאה באישור ההוצאה.');
    } finally {
      setApprovingLine(null);
    }
  };

  const handleConfirmApproveNoExpense = async (note: string) => {
    if (!approvingInvoice) return;
    try {
      const res = await fetch(`/api/invoices/${approvingInvoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'approved_no_expense',
          approval_note: note
        })
      });
      if (!res.ok) throw new Error('Failed to approve invoice');

      fetchUnmatchedData(true);
    } catch (error) {
      console.error(error);
      alert('שגיאה באישור החשבונית.');
    } finally {
      setApprovingInvoice(null);
    }
  };

  const handleDirectUploadSuccess = async (invoice: Invoice, expenseLineId: string) => {
    try {
      await handleMatch(invoice.id, expenseLineId, invoice.total_amount || 0, 'manual', false);
      setUploadingLine(null);
    } catch (error) {
      console.error('Error matching uploaded invoice', error);
      alert('החשבונית הועלתה אך נכשלה בהתאמה לשורה.');
    }
  };

  const handleNoteSave = (noteText: string) => {
    if (!noteLine) return;
    setExpenseLines(prev => prev.map(l => l.id === noteLine.id ? { ...l, approval_note: noteText } : l));
    setNoteLine(null);
  };

  // Generate Auto-Match Proposals (Score >= 70)
  const autoMatchProposals = useMemo(() => {
    const proposals: any[] = [];
    const usedLines = new Set();
    const usedInvoices = new Set();

    for (const inv of invoices) {
      if (usedInvoices.has(inv.id)) continue;

      let bestLine = null;
      let bestScore = -1;

      for (const line of expenseLines) {
        if (line.status === 'approved' || line.status === 'approved_no_invoice') continue;
        if (usedLines.has(line.id)) continue;
        const score = getMatchScore([inv], line);
        if (score >= 70 && score > bestScore) {
          bestScore = score;
          bestLine = line;
        }
      }

      if (bestLine) {
        proposals.push({ invoice: inv, line: bestLine, score: bestScore, selected: true });
        usedLines.add(bestLine.id);
        usedInvoices.add(inv.id);
      }
    }
    return proposals;
  }, [invoices, expenseLines]);

  // Sorting functions
  const sortData = (data: any[], sort: { field: SortField, dir: SortDirection }, type: 'invoice' | 'line') => {
    return [...data].sort((a, b) => {
      let valA, valB;
      if (sort.field === 'date') {
        valA = type === 'invoice' ? a.invoice_date : a.transaction_date;
        valB = type === 'invoice' ? b.invoice_date : b.transaction_date;
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      } else if (sort.field === 'amount') {
        valA = type === 'invoice' ? a.total_amount : a.amount;
        valB = type === 'invoice' ? b.total_amount : b.amount;
      } else if (sort.field === 'name') {
        valA = type === 'invoice' ? a.supplier_name : a.description;
        valB = type === 'invoice' ? b.supplier_name : b.description;
        valA = (valA || '').toLowerCase();
        valB = (valB || '').toLowerCase();
      }

      if (valA < valB) return sort.dir === 'asc' ? -1 : 1;
      if (valA > valB) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Filtered + sorted invoices (with quick search)
  const sortedInvoices = useMemo(() => {
    let items = invoices;
    if (invSearch) {
      const q = invSearch.toLowerCase();
      items = items.filter(inv => (inv.supplier_name || '').toLowerCase().includes(q));
    }
    return sortData(items, invSort, 'invoice');
  }, [invoices, invSort, invSearch]);

  const candidateLines = selectedInvoices.length > 0
    ? expenseLines
      .filter(line => {
        if (line.status === 'approved' || line.status === 'approved_no_invoice') return false;
        if (lineSearch) {
          const q = lineSearch.toLowerCase();
          return (line.description || '').toLowerCase().includes(q);
        }
        return true;
      })
      .map(line => ({ line, score: getMatchScore(selectedInvoices, line) }))
      .sort((a, b) => b.score - a.score)
    : [];

  // Filtered + sorted expense lines (with quick search)
  const filteredLines = useMemo(() => {
    let lines = expenseLines;
    if (lineFilter === 'pending') {
      lines = lines.filter(l => l.status !== 'approved' && l.status !== 'approved_no_invoice');
    } else if (lineFilter === 'matched') {
      lines = lines.filter(l => l.status === 'approved' || l.status === 'approved_no_invoice');
    }
    if (lineSearch) {
      const q = lineSearch.toLowerCase();
      lines = lines.filter(l => (l.description || '').toLowerCase().includes(q));
    }
    return lines;
  }, [expenseLines, lineFilter, lineSearch]);

  const sortedLines = useMemo(() => sortData(filteredLines, lineSort, 'line'), [filteredLines, lineSort]);

  const toggleSort = (type: 'inv' | 'line', field: SortField) => {
    const setSort = type === 'inv' ? setInvSort : setLineSort;
    setSort(prev => {
      if (prev.field === field) return { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      return { field, dir: 'asc' };
    });
  };

  const SortHeader = ({ type, field, label }: { type: 'inv' | 'line', field: SortField, label: string }) => {
    const sort = type === 'inv' ? invSort : lineSort;
    const isActive = sort.field === field;
    return (
      <button
        onClick={() => toggleSort(type, field)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 'var(--font-size-xs)', fontWeight: 600,
          color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          display: 'flex', alignItems: 'center', gap: '4px'
        }}
      >
        {label}
        {isActive && <span>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    );
  };

  // Filter button styles
  const getFilterStyle = (filter: LineFilter, current: LineFilter) => {
    const isActive = filter === current;
    const baseStyle: React.CSSProperties = {
      padding: '4px 12px',
      fontSize: '12px',
      height: 'auto',
      border: 'none',
      borderRadius: 'var(--radius-md)',
      cursor: 'pointer',
      fontWeight: 600,
      transition: 'all var(--transition-fast)',
    };
    if (!isActive) {
      return { ...baseStyle, background: 'transparent', color: 'var(--color-text-secondary)' };
    }
    switch (filter) {
      case 'pending': return { ...baseStyle, background: '#f59e0b', color: '#fff' };
      case 'matched': return { ...baseStyle, background: '#10b981', color: '#fff' };
      case 'all': return { ...baseStyle, background: 'var(--color-accent)', color: '#fff' };
    }
  };

  // Render expense line row (shared between normal and candidate views)
  const renderLineRow = (line: ExpenseLine, score?: number) => {
    const isCandidate = score !== undefined;
    return (
      <div
        key={line.id}
        style={{
          padding: 'var(--space-2)',
          background: isCandidate && score > 50 ? 'var(--color-success-muted)' : 'var(--color-bg-secondary)',
          border: `1px solid ${isCandidate && score > 50 ? 'var(--color-success)' : 'var(--color-glass-border)'}`,
          borderRadius: 'var(--radius-md)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
              {formatCurrency(line.amount)}
              {line.total_amount && line.total_amount !== line.amount && (
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginRight: 'var(--space-2)', fontWeight: 400 }}>
                  {line.currency !== 'ILS'
                    ? `(${line.total_amount} ${line.currency})`
                    : `(מתוך ${formatCurrency(line.total_amount)})`
                  }
                </span>
              )}
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)' }}>{line.description}</div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{formatToIsraeliDate(line.transaction_date)}</div>
            {line.approval_note && (
              <div style={{ fontSize: '10px', color: 'var(--color-accent)', marginTop: '2px', fontStyle: 'italic' }}>
                📝 {line.approval_note}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
            {line.status === 'approved' || line.status === 'approved_no_invoice' ? (
              <>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <span style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                    {line.status === 'approved_no_invoice' ? '✔️ אושר ללא חשבונית' : '✅ הותאם'}
                  </span>
                  {(() => {
                    const matchObj = Array.isArray((line as any).matches) ? (line as any).matches[0] : (line as any).matches;
                    return matchObj && matchObj.invoice ? (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => { e.stopPropagation(); setViewingInvoice(matchObj.invoice); }}
                      >
                        📄 צפה
                      </button>
                    ) : null;
                  })()}
                  <button
                    onClick={(e) => { e.stopPropagation(); setNoteLine(line); }}
                    title="הערה"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0 2px', opacity: line.approval_note ? 1 : 0.5 }}
                  >
                    📝
                  </button>
                </div>
                {line.status === 'approved_no_invoice' && line.approval_note && (
                  <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontStyle: 'italic', background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>
                    סיבה: {line.approval_note}
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  {isCandidate && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleManualMatch(line)}
                      disabled={matchingLineId === line.id}
                    >
                      {matchingLineId === line.id ? 'מתאים...' : '🔗 בצע התאמה'}
                    </button>
                  )}
                  <button
                    onClick={(e) => handleDeleteLineClick(line, e)}
                    title="מחק שורה"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 4px', opacity: 0.7 }}
                  >
                    🗑️
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setNoteLine(line); }}
                    title="הערה"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0 2px', opacity: line.approval_note ? 1 : 0.5 }}
                  >
                    📝
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setUploadingLine(line); }}
                    style={{ background: 'none', border: 'none', padding: 0, fontSize: '11px', color: 'var(--color-text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    ➕ צרף חשבונית
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setApprovingLine(line); }}
                    style={{ background: 'none', border: 'none', padding: 0, fontSize: '11px', color: 'var(--color-text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    אישור ללא חשבונית
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid var(--color-glass-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto var(--space-4)' }} />
        <div style={{ color: 'var(--color-text-secondary)' }}>טוען נתונים לזירת ההתאמות...</div>
        <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <label style={{ fontWeight: 600 }}>חודש חיוב:</label>
          <input
            type="month"
            className="input"
            value={chargeMonth}
            onChange={(e) => setChargeMonth(e.target.value)}
          />
          <button
            className="btn btn-secondary"
            onClick={() => window.open(`/api/export?chargeMonth=${chargeMonth}&status=all`, '_blank')}
            title="יצוא לאקסל עבור חודש החיוב הנוכחי"
          >
            📊 ייצא לרו״ח
          </button>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowAutoMatch(true)}
          style={{ background: 'var(--color-accent)' }}
        >
          🤖 התאמה אוטומטית ({autoMatchProposals.length})
        </button>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-6)', height: 'calc(100vh - 200px)' }}>
        {/* Left Panel: Expense Lines */}
        <div className="card" style={{ flex: 6, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-glass-border)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700 }}>🏦 שורות הוצאה ({filteredLines.length})</h2>
              
              <div style={{ display: 'flex', gap: '4px', background: 'var(--color-bg-tertiary)', padding: '2px', borderRadius: 'var(--radius-md)' }}>
                <button style={getFilterStyle('all', lineFilter)} onClick={() => setLineFilter('all')}>הכל</button>
                <button style={getFilterStyle('pending', lineFilter)} onClick={() => setLineFilter('pending')}>ממתינות</button>
                <button style={getFilterStyle('matched', lineFilter)} onClick={() => setLineFilter('matched')}>הותאמו</button>
              </div>
            </div>

            {/* Quick Search */}
            <div style={{ marginTop: 'var(--space-2)', position: 'relative' }}>
              <input
                type="text"
                placeholder="🔍 חיפוש מהיר לפי שם..."
                value={lineSearch}
                onChange={(e) => setLineSearch(e.target.value)}
                style={{
                  width: '100%', padding: '6px 12px', paddingLeft: '30px', fontSize: 'var(--font-size-xs)',
                  border: '1px solid var(--color-glass-border)', borderRadius: 'var(--radius-md)',
                  background: 'var(--color-bg-primary)', color: 'inherit',
                }}
              />
              {lineSearch && (
                <button
                  onClick={() => setLineSearch('')}
                  style={{
                    position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-muted)', fontSize: '14px', padding: '2px'
                  }}
                  title="נקה חיפוש"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sort Controls */}
            {selectedInvoices.length === 0 && (
              <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>מיין לפי:</span>
                <SortHeader type="line" field="date" label="תאריך" />
                <SortHeader type="line" field="amount" label="סכום" />
                <SortHeader type="line" field="name" label="שם" />
              </div>
            )}

            {selectedInvoices.length > 0 && (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-accent)', marginTop: 'var(--space-2)' }}>
                מציג הצעות התאמה עבור {selectedInvoices.length} חשבוניות (סה״כ {formatCurrency(selectedInvoices.reduce((s, i) => s + (i.total_amount || 0), 0))})
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {expenseLines.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">✅</div>
                <div className="empty-state-text">אין שורות הוצאה שממתינות להתאמה.</div>
              </div>
            ) : selectedInvoices.length > 0 ? (
              candidateLines.map(({ line, score }) => renderLineRow(line, score))
            ) : (
              sortedLines.map((line) => renderLineRow(line))
            )}
          </div>
        </div>

        {/* Right Panel: Invoices */}
        <div className="card" style={{ flex: 4, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-glass-border)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700 }}>🧾 חשבוניות ממתינות ({sortedInvoices.length})</h2>
              {selectedInvoices.length > 0 && (
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedInvoices([])}
                  style={{ background: 'var(--color-bg-tertiary)' }}
                >
                  ביטול ({selectedInvoices.length})
                </button>
              )}
            </div>

            {/* Quick Search */}
            <div style={{ marginTop: 'var(--space-2)', position: 'relative' }}>
              <input
                type="text"
                placeholder="🔍 חיפוש מהיר לפי שם ספק..."
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                style={{
                  width: '100%', padding: '6px 12px', paddingLeft: '30px', fontSize: 'var(--font-size-xs)',
                  border: '1px solid var(--color-glass-border)', borderRadius: 'var(--radius-md)',
                  background: 'var(--color-bg-primary)', color: 'inherit',
                }}
              />
              {invSearch && (
                <button
                  onClick={() => setInvSearch('')}
                  style={{
                    position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-muted)', fontSize: '14px', padding: '2px'
                  }}
                  title="נקה חיפוש"
                >
                  ✕
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>מיין לפי:</span>
              <SortHeader type="inv" field="date" label="תאריך" />
              <SortHeader type="inv" field="amount" label="סכום" />
              <SortHeader type="inv" field="name" label="שם" />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {sortedInvoices.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">✅</div>
                <div className="empty-state-text">אין חשבוניות שממתינות להתאמה.</div>
              </div>
            ) : (
              sortedInvoices.map((inv) => {
                const isSelected = selectedInvoices.some(i => i.id === inv.id);
                return (
                <div
                  key={inv.id}
                  onClick={() => setSelectedInvoices(prev => isSelected ? prev.filter(i => i.id !== inv.id) : [...prev, inv])}
                  style={{
                    padding: 'var(--space-2)',
                    background: isSelected ? 'var(--color-accent-subtle)' : 'var(--color-bg-secondary)',
                    border: `1px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-glass-border)'}`,
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: isSelected ? 'var(--color-accent)' : 'inherit' }}>
                      {formatCurrency(inv.total_amount)}
                    </div>
                    <div style={{ fontSize: '10px', background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>
                      {inv.original_filename?.split('.').pop()?.toUpperCase()}
                    </div>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {inv.status === 'error' && <span title="חשבונית לא מזוהה" style={{ color: 'var(--color-warning)' }}>⚠️</span>}
                    <span
                      onClick={(e) => { e.stopPropagation(); setViewingInvoice(inv); }}
                      style={{ textDecoration: 'underline', cursor: 'pointer' }}
                      title="לחץ לצפייה ועריכת פרטי החשבונית"
                    >
                      {inv.supplier_name || 'ספק לא ידוע'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{formatToIsraeliDate(inv.invoice_date)}</div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setApprovingInvoice(inv); }}
                      style={{ background: 'none', border: 'none', padding: 0, fontSize: '11px', color: 'var(--color-text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      ✔️ אישור ללא הוצאה
                    </button>
                  </div>
                </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <InvoiceDetailPanel
        invoice={viewingInvoice}
        onClose={() => setViewingInvoice(null)}
        onSaved={() => fetchUnmatchedData(true)}
      />

      {showAutoMatch && (
        <AutoMatchModal
          onClose={() => setShowAutoMatch(false)}
          onConfirm={handleAutoMatchConfirm}
          proposals={autoMatchProposals}
          onViewInvoice={(invoice) => setViewingInvoice(invoice)}
        />
      )}

      <ApproveNoInvoiceModal
        isOpen={!!approvingLine}
        onClose={() => setApprovingLine(null)}
        onConfirm={handleConfirmApproveNoInvoice}
        expenseLines={approvingLine ? [approvingLine] : []}
      />

      <ApproveNoExpenseModal
        isOpen={!!approvingInvoice}
        onClose={() => setApprovingInvoice(null)}
        onConfirm={handleConfirmApproveNoExpense}
        invoices={approvingInvoice ? [approvingInvoice] : []}
      />

      <DirectUploadModal
        isOpen={!!uploadingLine}
        onClose={() => setUploadingLine(null)}
        expenseLine={uploadingLine}
        onUploadSuccess={handleDirectUploadSuccess}
      />

      <DeleteExpenseModal
        isOpen={!!deletingLine}
        onClose={() => setDeletingLine(null)}
        onConfirm={handleConfirmDelete}
        expenseLine={deletingLine}
      />

      <NoteModal
        isOpen={!!noteLine}
        onClose={() => setNoteLine(null)}
        onSave={handleNoteSave}
        expenseLine={noteLine}
      />
    </>
  );
}
