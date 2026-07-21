'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Invoice } from '@/lib/supabase/types';
import StatusBadge from '../ui/StatusBadge';
import { formatToIsraeliDate } from '@/lib/utils/dates';
import InvoiceDetailDrawer from './InvoiceDetailDrawer';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(amount);
}

type StatusTab = 'pending' | 'matched' | 'error' | 'sent' | 'all';

const STATUS_TAB_MAP: Record<StatusTab, string> = {
  pending: 'new,processing,partially_matched',
  matched: 'fully_matched,approved_no_expense',
  error: 'error',
  sent: '', // handled separately by sentToAccountant=true
  all: '',
};

const STATUS_TAB_LABELS: Record<StatusTab, string> = {
  pending: 'ממתין',
  matched: 'הותאם',
  error: 'שגיאה',
  sent: 'נשלח לרו״ח',
  all: 'הכל',
};

const STATUS_TAB_ICONS: Record<StatusTab, string> = {
  pending: '⏳',
  matched: '✅',
  error: '⚠️',
  sent: '📨',
  all: '📋',
};

export default function InvoiceGrid() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(100);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<StatusTab>('pending');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Sort State
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);

  // Tab counts
  const [tabCounts, setTabCounts] = useState<Record<StatusTab, number>>({ pending: 0, matched: 0, error: 0, sent: 0, all: 0 });

  // Selected Invoice for Drawer
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Fetch categories on mount
  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories || []))
      .catch(console.error);
  }, []);

  // Fetch tab counts
  const fetchTabCounts = useCallback(async () => {
    try {
      const tabs: StatusTab[] = ['pending', 'matched', 'error', 'sent', 'all'];
      const counts: Record<StatusTab, number> = { pending: 0, matched: 0, error: 0, sent: 0, all: 0 };
      
      await Promise.all(tabs.map(async (tab) => {
        const statusParam = STATUS_TAB_MAP[tab];
        const params = new URLSearchParams({ limit: '1', page: '1' });
        if (statusParam) params.set('status', statusParam);
        if (tab === 'sent') {
          params.set('sentToAccountant', 'true');
        } else if (tab !== 'all') {
          params.set('sentToAccountant', 'false');
        }
        const res = await fetch(`/api/invoices?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          counts[tab] = data.count || 0;
        }
      }));

      setTabCounts(counts);
    } catch (err) {
      console.error('Error fetching tab counts', err);
    }
  }, []);

  useEffect(() => {
    fetchTabCounts();
  }, [fetchTabCounts]);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const tabStatus = STATUS_TAB_MAP[activeTab];
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search,
        status: filterStatus || tabStatus,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount,
        categoryId,
        sortBy,
        sortOrder,
      });

      if (activeTab === 'sent') {
        queryParams.set('sentToAccountant', 'true');
      } else if (activeTab !== 'all') {
        queryParams.set('sentToAccountant', 'false');
      }

      const res = await fetch(`/api/invoices?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error('שגיאה בטעינת רשימת החשבוניות.');
      }
      const data = await res.json();
      setInvoices(data.invoices || []);
      setTotalCount(data.count || 0);
      setTotalPages(data.totalPages || 0);
    } catch (err) {
      console.error('Error fetching invoices:', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, activeTab, filterStatus, dateFrom, dateTo, minAmount, maxAmount, categoryId, sortBy, sortOrder]);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchInvoices();
    }, 300);

    return () => clearTimeout(handler);
  }, [fetchInvoices]);

  const handleInvoiceUpdate = (updatedInvoice: Invoice) => {
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === updatedInvoice.id ? updatedInvoice : inv))
    );
    if (selectedInvoice && selectedInvoice.id === updatedInvoice.id) {
      setSelectedInvoice(updatedInvoice);
    }
  };

  const handleRowClick = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
  };

  const handleDeleteClick = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('האם אתה בטוח שברצונך למחוק חשבונית זו? הקובץ המקושר ב-Google Drive יימחק גם הוא.')) {
      return;
    }

    try {
      const res = await fetch(`/api/invoices?id=${id}`, { method: 'DELETE' });

      if (!res.ok) {
        throw new Error('שגיאה במחיקת החשבונית.');
      }

      const data = await res.json();
      if (data.success) {
        setInvoices((prev) => prev.filter((inv) => inv.id !== id));
        setTotalCount((prev) => prev - 1);
        if (selectedInvoice?.id === id) {
          setSelectedInvoice(null);
        }
        fetchTabCounts();
      }
    } catch (err) {
      console.error('Delete invoice error:', err);
      alert('שגיאה במחיקת מסמך החשבונית.');
    }
  };

  const handleCategoryChange = async (e: React.ChangeEvent<HTMLSelectElement>, invoiceId: string) => {
    e.stopPropagation();
    const newCategoryId = e.target.value;
    
    const selectedCat = categories.find(c => c.id === newCategoryId) || null;
    
    setInvoices(prev => prev.map(inv => {
      if (inv.id === invoiceId) {
        return {
          ...inv,
          category_id: newCategoryId || null,
          categories: selectedCat
        } as any;
      }
      return inv;
    }));

    if (selectedInvoice && selectedInvoice.id === invoiceId) {
      setSelectedInvoice(prev => prev ? ({
        ...prev,
        category_id: newCategoryId || null,
        categories: selectedCat
      } as any) : null);
    }

    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: newCategoryId || null })
      });
      if (!res.ok) throw new Error('Failed to update category');
    } catch (err) {
      console.error(err);
      alert('שגיאה בעדכון הקטגוריה. מרענן נתונים...');
      fetchInvoices();
    }
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortBy !== column) return '';
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };

  const handleTabChange = (tab: StatusTab) => {
    setActiveTab(tab);
    setFilterStatus(''); // Reset status filter on tab change
    setPage(1);
  };

  const getTabStyle = (tab: StatusTab): React.CSSProperties => {
    const isActive = activeTab === tab;
    const baseStyle: React.CSSProperties = {
      padding: '8px 20px',
      fontSize: 'var(--font-size-sm)',
      fontWeight: 600,
      cursor: 'pointer',
      border: 'none',
      borderBottom: isActive ? '3px solid' : '3px solid transparent',
      background: 'transparent',
      transition: 'all var(--transition-fast)',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    };

    if (!isActive) {
      return { ...baseStyle, color: 'var(--color-text-secondary)', opacity: 0.7 };
    }
    
    switch (tab) {
      case 'pending': return { ...baseStyle, color: '#f59e0b', borderBottomColor: '#f59e0b' };
      case 'matched': return { ...baseStyle, color: '#10b981', borderBottomColor: '#10b981' };
      case 'error': return { ...baseStyle, color: '#ef4444', borderBottomColor: '#ef4444' };
      case 'sent': return { ...baseStyle, color: '#8b5cf6', borderBottomColor: '#8b5cf6' };
      case 'all': return { ...baseStyle, color: 'var(--color-accent)', borderBottomColor: 'var(--color-accent)' };
    }
  };

  return (
    <div>
      {/* Status Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-glass-border)', marginBottom: 'var(--space-4)' }}>
        {(['pending', 'matched', 'error', 'all'] as StatusTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            style={getTabStyle(tab)}
          >
            <span>{STATUS_TAB_ICONS[tab]}</span>
            <span>{STATUS_TAB_LABELS[tab]}</span>
            <span style={{
              background: activeTab === tab ? 'currentColor' : 'var(--color-bg-tertiary)',
              color: activeTab === tab ? '#fff' : 'var(--color-text-secondary)',
              padding: '1px 8px',
              borderRadius: 'var(--radius-full)',
              fontSize: '11px',
              fontWeight: 700,
              minWidth: '24px',
              textAlign: 'center',
            }}>
              {tabCounts[tab]}
            </span>
          </button>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="card animate-in" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-body" style={{ padding: 'var(--space-4)' }}>
          <div className="filter-bar">
            <input
              type="text"
              placeholder="חיפוש לפי שם ספק, ח.פ..."
              className="search-input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{ flex: 2 }}
            />

            {/* Date From */}
            <input
              type="date"
              placeholder="מתאריך"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
            />

            {/* Date To */}
            <input
              type="date"
              placeholder="עד תאריך"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
            />

            {/* Min Amount */}
            <input
              type="number"
              placeholder="סכום מינימום (₪)"
              value={minAmount}
              onChange={(e) => {
                setMinAmount(e.target.value);
                setPage(1);
              }}
              style={{ maxWidth: '130px' }}
            />

            {/* Max Amount */}
            <input
              type="number"
              placeholder="סכום מקסימום (₪)"
              value={maxAmount}
              onChange={(e) => {
                setMaxAmount(e.target.value);
                setPage(1);
              }}
              style={{ maxWidth: '130px' }}
            />

            {/* Category Filter */}
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
              style={{ maxWidth: '150px' }}
            >
              <option value="">כל הקטגוריות</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            {activeTab !== 'error' && (
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setPage(1);
                }}
                style={{ maxWidth: '150px' }}
              >
                <option value="">כל הסטטוסים</option>
                {(activeTab === 'pending' || activeTab === 'all' || activeTab === 'sent') && (
                  <>
                    <option value="new">חדש</option>
                    <option value="processing">בטיפול</option>
                    <option value="partially_matched">הותאם חלקי</option>
                  </>
                )}
                {(activeTab === 'matched' || activeTab === 'all' || activeTab === 'sent') && (
                  <>
                    <option value="fully_matched">הותאם</option>
                    <option value="approved_no_expense">אושר ללא הוצאה</option>
                  </>
                )}
                {(activeTab === 'all' || activeTab === 'sent') && <option value="error">שגיאה</option>}
              </select>
            )}

            {/* Reset Button */}
            {(search || dateFrom || dateTo || minAmount || maxAmount || categoryId || filterStatus) && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSearch('');
                  setDateFrom('');
                  setDateTo('');
                  setMinAmount('');
                  setMaxAmount('');
                  setCategoryId('');
                  setFilterStatus('');
                  setPage(1);
                }}
              >
                נקה
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Invoices List Grid */}
      <div className="data-table-container animate-in">
        {loading ? (
          <div style={{ padding: 'var(--space-8)' }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: '48px', marginBottom: 'var(--space-3)' }} />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <div className="empty-state-title">לא נמצאו חשבוניות</div>
            <div className="empty-state-text">
              נסה לשנות את סינון החיפוש או העלה חשבונית חדשה.
            </div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>מקור</th>
                <th onClick={() => handleSort('supplier_name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  שם ספק <span style={{ opacity: sortBy === 'supplier_name' ? 1 : 0.3 }}>{getSortIcon('supplier_name') || '↕'}</span>
                </th>
                <th>ח.פ/ע.מ</th>
                <th onClick={() => handleSort('invoice_date')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  תאריך חשבונית <span style={{ opacity: sortBy === 'invoice_date' ? 1 : 0.3 }}>{getSortIcon('invoice_date') || '↕'}</span>
                </th>
                <th onClick={() => handleSort('created_at')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  תאריך העלאה <span style={{ opacity: sortBy === 'created_at' ? 1 : 0.3 }}>{getSortIcon('created_at') || '↕'}</span>
                </th>
                <th onClick={() => handleSort('total_amount')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  סכום כולל <span style={{ opacity: sortBy === 'total_amount' ? 1 : 0.3 }}>{getSortIcon('total_amount') || '↕'}</span>
                </th>
                <th>מע״מ</th>
                <th>קטגוריה</th>
                <th>הותאם</th>
                <th>סטטוס</th>
                <th style={{ textAlign: 'left' }}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => handleRowClick(inv)}
                  style={{ cursor: 'pointer' }}
                  className={selectedInvoice?.id === inv.id ? 'selected' : ''}
                >
                  <td style={{ fontSize: 'var(--font-size-lg)' }}>
                    {inv.source === 'email' ? '📧' : inv.source === 'telegram' ? '📱' : '📤'}
                  </td>
                  <td style={{ fontWeight: 600 }}>{inv.supplier_name || '—'}</td>
                  <td>{inv.supplier_tax_id || '—'}</td>
                  <td className="table-date">{formatToIsraeliDate(inv.invoice_date)}</td>
                  <td className="table-date" style={{ color: 'var(--color-text-secondary)', fontSize: '0.9em' }}>{formatToIsraeliDate(inv.created_at)}</td>
                  <td className="table-amount">{formatCurrency(inv.total_amount)}</td>
                  <td className="table-amount" style={{ color: 'var(--color-text-secondary)' }}>
                    {formatCurrency(inv.vat_amount)}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select
                      className="input btn-sm"
                      style={{ 
                        padding: '2px 24px 2px 8px', 
                        fontSize: 'var(--font-size-xs)', 
                        height: 'auto',
                        minWidth: '130px',
                        backgroundColor: (inv as any).categories ? `${(inv as any).categories.color}15` : 'transparent',
                        borderColor: (inv as any).categories ? `${(inv as any).categories.color}40` : 'var(--color-border)',
                        color: (inv as any).categories ? (inv as any).categories.color : 'inherit',
                        fontWeight: (inv as any).categories ? 600 : 400
                      }}
                      value={(inv as any).category_id || ''}
                      onChange={(e) => handleCategoryChange(e, inv.id)}
                    >
                      <option value="">ללא קטגוריה</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon} {cat.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="table-amount" style={{ color: 'var(--color-success)' }}>
                    {formatCurrency(inv.matched_amount)}
                  </td>
                  <td>
                    <StatusBadge status={inv.status} />
                    {(inv as any).approval_note && (
                      <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontStyle: 'italic', marginTop: '4px' }}>
                        סיבה: {(inv as any).approval_note}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'left' }}>
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={(e) => handleDeleteClick(e, inv.id)}
                      title="מחק חשבונית"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      {!loading && totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 'var(--space-6)',
            padding: '0 var(--space-2)',
          }}
        >
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            מציג <strong>{invoices.length}</strong> מתוך <strong>{totalCount}</strong> חשבוניות
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page === 1}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            >
              הקודם
            </button>
            <span style={{ alignSelf: 'center', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              עמוד <strong>{page}</strong> מתוך <strong>{totalPages}</strong>
            </span>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page === totalPages}
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            >
              הבא
            </button>
          </div>
        </div>
      )}

      {/* Details Slide-out Drawer */}
      <InvoiceDetailDrawer
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        onUpdate={handleInvoiceUpdate}
        onDelete={(id) => {
          setInvoices((prev) => prev.filter((inv) => inv.id !== id));
          setTotalCount((prev) => prev - 1);
          setSelectedInvoice(null);
          fetchTabCounts();
        }}
      />
    </div>
  );
}
