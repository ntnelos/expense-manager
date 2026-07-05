'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ExpenseLine } from '@/lib/supabase/types';
import { formatToIsraeliDate } from '@/lib/utils/dates';
import Link from 'next/link';

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(amount);
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'approved':
      return <span style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>הותאם לחשבונית</span>;
    case 'approved_no_invoice':
      return <span style={{ background: 'var(--color-warning-muted)', color: 'var(--color-warning)', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>אושר ללא חשבונית</span>;
    case 'unapproved':
    default:
      return <span style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>ממתין להתאמה</span>;
  }
}

export default function ExpenseLineGrid() {
  const [lines, setLines] = useState<ExpenseLine[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  // Bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchLines = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search,
        status,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount,
      });

      const res = await fetch(`/api/expense-lines?${queryParams.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch expense lines');
      const data = await res.json();
      setLines(data.expenseLines || []);
      setTotalCount(data.count || 0);
      setTotalPages(data.totalPages || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, status, dateFrom, dateTo, minAmount, maxAmount]);

  useEffect(() => {
    const handler = setTimeout(fetchLines, 300);
    return () => clearTimeout(handler);
  }, [fetchLines]);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === lines.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(lines.map((l) => l.id)));
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`האם אתה בטוח שברצונך לאשר ${selectedIds.size} שורות ללא חשבונית?`)) return;

    try {
      const res = await fetch('/api/expense-lines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          status: 'approved_no_invoice',
        }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        fetchLines();
      }
    } catch (err) {
      console.error(err);
      alert('שגיאה בעדכון הסטטוס');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק שורה זו?')) return;
    try {
      const res = await fetch(`/api/expense-lines?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchLines();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      {/* Filter Bar */}
      <div className="card animate-in" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-body" style={{ padding: 'var(--space-4)' }}>
          <div className="filter-bar">
            <input
              type="text"
              placeholder="חיפוש תיאור, קטגוריה..."
              className="search-input"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ flex: 2 }}
            />
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">כל הסטטוסים</option>
              <option value="unapproved">ממתין להתאמה</option>
              <option value="approved">הותאם לחשבונית</option>
              <option value="approved_no_invoice">אושר ללא חשבונית</option>
            </select>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
            <input type="number" placeholder="סכום מזערי" value={minAmount} onChange={(e) => { setMinAmount(e.target.value); setPage(1); }} style={{ maxWidth: '100px' }} />
            <input type="number" placeholder="סכום מירבי" value={maxAmount} onChange={(e) => { setMaxAmount(e.target.value); setPage(1); }} style={{ maxWidth: '100px' }} />
            
            {(search || status || dateFrom || dateTo || minAmount || maxAmount) && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSearch(''); setStatus(''); setDateFrom(''); setDateTo(''); setMinAmount(''); setMaxAmount(''); setPage(1);
                }}
              >
                נקה
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--color-primary-muted)',
          border: '1px solid var(--color-primary)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-4)',
          color: 'white',
        }}>
          <div>
            <strong>{selectedIds.size}</strong> שורות נבחרו
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn btn-primary btn-sm" onClick={handleBulkApprove}>
              ✅ אשר ללא חשבונית
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())} style={{ color: 'white' }}>
              בטל בחירה
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="data-table-container">
        {loading ? (
          <div style={{ padding: 'var(--space-6)' }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: '44px', marginBottom: 'var(--space-2)' }} />
            ))}
          </div>
        ) : lines.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏦</div>
            <div className="empty-state-title">אין שורות הוצאה</div>
            <div className="empty-state-text">לא נמצאו שורות תואמות לסינון או שטרם ייבאת נתונים.</div>
            <Link href="/import" className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }}>
              📥 עבר לייבוא נתונים
            </Link>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === lines.length && lines.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>תאריך עסקה</th>
                <th>תיאור / עסק</th>
                <th>סכום</th>
                <th>קטגוריה מקורית</th>
                <th>כרטיס</th>
                <th>סטטוס</th>
                <th style={{ textAlign: 'end' }}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className={selectedIds.has(line.id) ? 'selected' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(line.id)}
                      onChange={() => toggleSelection(line.id)}
                    />
                  </td>
                  <td>{formatToIsraeliDate(line.transaction_date)}</td>
                  <td style={{ fontWeight: 600 }}>{line.description || '—'}</td>
                  <td className="table-amount">
                    <div style={{ fontWeight: 600 }}>{formatCurrency(line.amount)}</div>
                    {line.total_amount && line.total_amount !== line.amount && (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                        מתוך {formatCurrency(line.total_amount)}
                        {line.installment_current && line.installment_total ? ` (תשלום ${line.installment_current}/${line.installment_total})` : ''}
                      </div>
                    )}
                  </td>
                  <td>
                    {line.original_category ? (
                      <span style={{ fontSize: 'var(--font-size-xs)', background: 'var(--color-bg-secondary)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>
                        {line.original_category}
                      </span>
                    ) : '—'}
                  </td>
                  <td>{line.card_last_digits ? `**** ${line.card_last_digits}` : '—'}</td>
                  <td>{getStatusBadge(line.status)}</td>
                  <td style={{ textAlign: 'end' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-icon" title="מחק" onClick={() => handleDelete(line.id)}>
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-6)', padding: '0 var(--space-2)' }}>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            מציג <strong>{lines.length}</strong> מתוך <strong>{totalCount}</strong> שורות
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => Math.max(p - 1, 1))}>הקודם</button>
            <span style={{ alignSelf: 'center', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>עמוד <strong>{page}</strong> מתוך <strong>{totalPages}</strong></span>
            <button className="btn btn-secondary btn-sm" disabled={page === totalPages} onClick={() => setPage(p => Math.min(p + 1, totalPages))}>הבא</button>
          </div>
        </div>
      )}
    </div>
  );
}
