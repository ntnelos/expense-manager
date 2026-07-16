'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Invoice, ExpenseLine } from '@/lib/supabase/types';
import { formatToIsraeliDate } from '@/lib/utils/dates';
import InvoiceDetailPanel from './InvoiceDetailPanel';
import AutoMatchModal from './AutoMatchModal';
import ApproveNoInvoiceModal from '../expense-lines/ApproveNoInvoiceModal';

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(amount);
}

type SortField = 'date' | 'amount' | 'name';
type SortDirection = 'asc' | 'desc';

export default function MatchingArena() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenseLines, setExpenseLines] = useState<ExpenseLine[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [matchingLineId, setMatchingLineId] = useState<string | null>(null);
  
  // Sorting state
  const [invSort, setInvSort] = useState<{ field: SortField, dir: SortDirection }>({ field: 'date', dir: 'asc' });
  const [lineSort, setLineSort] = useState<{ field: SortField, dir: SortDirection }>({ field: 'date', dir: 'asc' });

  // Auto-Match modal state
  const [showAutoMatch, setShowAutoMatch] = useState(false);
  
  // Approve without invoice state
  const [approvingLine, setApprovingLine] = useState<ExpenseLine | null>(null);

  // Month selector
  const [chargeMonth, setChargeMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  });

  const fetchUnmatchedData = useCallback(async () => {
    try {
      setLoading(true);
      const invRes = await fetch('/api/invoices?status=new,error&limit=10000');
      const invData = await invRes.json();
      
      const expRes = await fetch(`/api/expense-lines?chargeMonth=${chargeMonth}&limit=1000`);
      const expData = await expRes.json();

      if (invRes.ok) setInvoices(invData.invoices || []);
      if (expRes.ok) setExpenseLines(expData.expenseLines || []);
    } catch (err) {
      console.error('Failed to fetch data for matching arena', err);
    } finally {
      setLoading(false);
    }
  }, [chargeMonth]);

  useEffect(() => {
    fetchUnmatchedData();
  }, [fetchUnmatchedData]);

  const getMatchScore = (invoice: Invoice, line: ExpenseLine) => {
    let score = 0;
    if (!invoice.total_amount || !line.amount) return 0;
    
    const diffAmount = Math.abs(invoice.total_amount - line.amount);
    if (diffAmount === 0) score += 50;
    else if (diffAmount <= 5) score += 20;
    
    if (invoice.invoice_date && line.transaction_date) {
      const invDate = new Date(invoice.invoice_date).getTime();
      const lineDate = new Date(line.transaction_date).getTime();
      const diffDays = Math.abs(invDate - lineDate) / (1000 * 3600 * 24);
      
      if (diffDays === 0) score += 50;
      else if (diffDays <= 3) score += 30;
      else if (diffDays <= 7) score += 10;
    }
    
    return score;
  };

  const handleMatch = async (invoiceId: string, lineId: string, matchedAmount: number, matchType: string = 'manual') => {
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

      fetchUnmatchedData();
    } catch (err: any) {
      throw err;
    }
  };

  const handleManualMatch = async (line: ExpenseLine) => {
    if (!selectedInvoice) return;
    setMatchingLineId(line.id);
    try {
      await handleMatch(selectedInvoice.id, line.id, selectedInvoice.total_amount || line.amount, 'manual');
      setSelectedInvoice(null);
    } catch (err: any) {
      alert(err.message || 'שגיאה בביצוע ההתאמה');
    } finally {
      setMatchingLineId(null);
    }
  };

  const handleAutoMatchConfirm = async (proposals: any[]) => {
    for (const p of proposals) {
      try {
        await handleMatch(p.invoice.id, p.line.id, p.invoice.total_amount || p.line.amount, p.score >= 100 ? 'auto_exact' : 'auto_tolerance');
      } catch (err: any) {
        console.error('Auto match failed for', p, err);
      }
    }
    setShowAutoMatch(false);
  };

  const handleDeleteLine = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('האם אתה בטוח שברצונך למחוק שורת הוצאה זו?')) return;
    
    try {
      const res = await fetch(`/api/expense-lines/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete expense line');
      
      setExpenseLines(prev => prev.filter(l => l.id !== id));
      alert('שורת ההוצאה נמחקה בהצלחה.');
    } catch (error) {
      console.error(error);
      alert('שגיאה במחיקת השורה.');
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
      
      fetchUnmatchedData();
    } catch (error) {
      console.error(error);
      alert('שגיאה באישור ההוצאה.');
    } finally {
      setApprovingLine(null);
    }
  };

  // Generate Auto-Match Proposals (Score >= 70)
  const autoMatchProposals = useMemo(() => {
    const proposals: any[] = [];
    const usedLines = new Set();
    const usedInvoices = new Set();

    // Loop through all invoices and find best line
    for (const inv of invoices) {
      if (usedInvoices.has(inv.id)) continue;
      
      let bestLine = null;
      let bestScore = -1;

      for (const line of expenseLines) {
        if (line.status === 'approved' || line.status === 'approved_no_invoice') continue;
        if (usedLines.has(line.id)) continue;
        const score = getMatchScore(inv, line);
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

  const sortedInvoices = useMemo(() => sortData(invoices, invSort, 'invoice'), [invoices, invSort]);
  
  const candidateLines = selectedInvoice 
    ? expenseLines
        .filter(line => line.status !== 'approved' && line.status !== 'approved_no_invoice')
        .map(line => ({ line, score: getMatchScore(selectedInvoice, line) }))
        .sort((a, b) => b.score - a.score)
    : [];

  const sortedLines = useMemo(() => sortData(expenseLines, lineSort, 'line'), [expenseLines, lineSort]);

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
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => setShowAutoMatch(true)}
          style={{ background: 'var(--color-accent)' }}
        >
          🤖 התאמה אוטומטית ({autoMatchProposals.length})
        </button>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-6)', minHeight: '600px' }}>
        {/* Left Panel: Expense Lines */}
        <div className="card" style={{ flex: 7, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-glass-border)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0' }}>
            <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700 }}>🏦 שורות הוצאה ממתינות ({expenseLines.length})</h2>
            
            {/* Sort Controls */}
            {!selectedInvoice && (
              <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>מיין לפי:</span>
                <SortHeader type="line" field="date" label="תאריך" />
                <SortHeader type="line" field="amount" label="סכום" />
                <SortHeader type="line" field="name" label="שם" />
              </div>
            )}

            {selectedInvoice && (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-accent)', marginTop: 'var(--space-2)' }}>
                מציג הצעות התאמה עבור {selectedInvoice.supplier_name || 'ספק לא ידוע'}
              </div>
            )}
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {expenseLines.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">✅</div>
                <div className="empty-state-text">אין שורות הוצאה שממתינות להתאמה.</div>
              </div>
            ) : selectedInvoice ? (
              // Show candidate lines sorted by score
              candidateLines.map(({ line, score }) => (
                <div 
                  key={line.id} 
                  style={{ 
                    padding: 'var(--space-3)', 
                    background: score > 50 ? 'var(--color-success-muted)' : 'var(--color-bg-secondary)', 
                    border: `1px solid ${score > 50 ? 'var(--color-success)' : 'var(--color-glass-border)'}`,
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-md)' }}>
                      {formatCurrency(line.amount)}
                      {line.total_amount && line.total_amount !== line.amount && (
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginRight: 'var(--space-2)', fontWeight: 400 }}>
                          {line.currency !== 'ILS' 
                            ? `(${line.total_amount} ${line.currency})` 
                            : `(מתוך ${formatCurrency(line.total_amount)})`
                          }
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-sm)' }}>{line.description}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{formatToIsraeliDate(line.transaction_date)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    {line.status === 'approved' || line.status === 'approved_no_invoice' ? (
                      <>
                        <span style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                          ✅ הותאם
                        </span>
                        {(line as any).matches && (line as any).matches.length > 0 && (line as any).matches[0].invoice && (
                          <button 
                            className="btn btn-secondary btn-sm"
                            onClick={(e) => { e.stopPropagation(); setViewingInvoice((line as any).matches[0].invoice); }}
                          >
                            📄 צפה בחשבונית
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button 
                          className="btn btn-primary btn-sm" 
                          onClick={() => handleManualMatch(line)}
                          disabled={matchingLineId === line.id}
                        >
                          {matchingLineId === line.id ? 'מתאים...' : '🔗 בצע התאמה'}
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setApprovingLine(line); }}
                          title="אישור ללא חשבונית"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 4px', opacity: 0.8 }}
                        >
                          ✔️
                        </button>
                        <button 
                          onClick={(e) => handleDeleteLine(line.id, e)}
                          title="מחק שורה"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 4px', opacity: 0.7 }}
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            ) : (
              // Just show normal list sorted
              sortedLines.map((line) => (
                <div 
                  key={line.id} 
                  style={{ 
                    padding: 'var(--space-3)', 
                    background: 'var(--color-bg-secondary)', 
                    border: '1px solid var(--color-glass-border)',
                    borderRadius: 'var(--radius-md)',
                    opacity: 0.7
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--font-size-md)' }}>
                        {formatCurrency(line.amount)}
                        {line.total_amount && line.total_amount !== line.amount && (
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginRight: 'var(--space-2)', fontWeight: 400 }}>
                            {line.currency !== 'ILS' 
                              ? `(${line.total_amount} ${line.currency})` 
                              : `(מתוך ${formatCurrency(line.total_amount)})`
                            }
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-sm)' }}>{line.description}</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{formatToIsraeliDate(line.transaction_date)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      {line.status === 'approved' || line.status === 'approved_no_invoice' ? (
                        <>
                          <span style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                            ✅ הותאם
                          </span>
                          {(line as any).matches && (line as any).matches.length > 0 && (line as any).matches[0].invoice && (
                            <button 
                              className="btn btn-secondary btn-sm"
                              onClick={(e) => { e.stopPropagation(); setViewingInvoice((line as any).matches[0].invoice); }}
                            >
                              📄 צפה בחשבונית
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setApprovingLine(line); }}
                            title="אישור ללא חשבונית"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 4px', opacity: 0.8 }}
                          >
                            ✔️
                          </button>
                          <button 
                            onClick={(e) => handleDeleteLine(line.id, e)}
                            title="מחק שורה"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 4px', opacity: 0.7 }}
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Invoices */}
        <div className="card" style={{ flex: 3, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-glass-border)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0' }}>
            <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700 }}>🧾 חשבוניות ממתינות ({invoices.length})</h2>
            
            <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>מיין לפי:</span>
              <SortHeader type="inv" field="date" label="תאריך" />
              <SortHeader type="inv" field="amount" label="סכום" />
              <SortHeader type="inv" field="name" label="שם" />
            </div>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {invoices.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">✅</div>
                <div className="empty-state-text">אין חשבוניות שממתינות להתאמה.</div>
              </div>
            ) : (
              sortedInvoices.map((inv) => (
                <div 
                  key={inv.id} 
                  onClick={() => setSelectedInvoice(prev => prev?.id === inv.id ? null : inv)}
                  style={{ 
                    padding: 'var(--space-3)', 
                    background: selectedInvoice?.id === inv.id ? 'var(--color-accent-subtle)' : 'var(--color-bg-secondary)', 
                    border: `1px solid ${selectedInvoice?.id === inv.id ? 'var(--color-accent)' : 'var(--color-glass-border)'}`,
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-md)', color: selectedInvoice?.id === inv.id ? 'var(--color-accent)' : 'inherit' }}>
                      {formatCurrency(inv.total_amount)}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>
                      {inv.original_filename?.split('.').pop()?.toUpperCase()}
                    </div>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {inv.status === 'error' && <span title="חשבונית לא מזוהה" style={{ color: 'var(--color-warning)' }}>⚠️</span>}
                    <span 
                      onClick={(e) => { e.stopPropagation(); setViewingInvoice(inv); }}
                      style={{ textDecoration: 'underline', cursor: 'pointer' }}
                      title="לחץ לצפייה ועריכת פרטי החשבונית"
                    >
                      {inv.supplier_name || 'ספק לא ידוע'}
                    </span>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{formatToIsraeliDate(inv.invoice_date)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <InvoiceDetailPanel 
        invoice={viewingInvoice} 
        onClose={() => setViewingInvoice(null)} 
        onSaved={fetchUnmatchedData}
      />

      {showAutoMatch && (
        <AutoMatchModal 
          onClose={() => setShowAutoMatch(false)}
          onConfirm={handleAutoMatchConfirm}
          proposals={autoMatchProposals}
        />
      )}
      
      <ApproveNoInvoiceModal
        isOpen={!!approvingLine}
        onClose={() => setApprovingLine(null)}
        onConfirm={handleConfirmApproveNoInvoice}
        expenseLines={approvingLine ? [approvingLine] : []}
      />
    </>
  );
}
