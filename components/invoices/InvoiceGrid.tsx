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

export default function InvoiceGrid() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(100);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);

  // Selected Invoice for Drawer
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Fetch categories on mount
  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories || []))
      .catch(console.error);
  }, []);

  const fetchInvoices = useCallback(async () => {
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
        categoryId,
      });

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
  }, [page, limit, search, status, dateFrom, dateTo, minAmount, maxAmount, categoryId]);

  useEffect(() => {
    // Debounce search filter updates to prevent hitting the API on every keystroke
    const handler = setTimeout(() => {
      fetchInvoices();
    }, 300);

    return () => clearTimeout(handler);
  }, [fetchInvoices]);

  // Handle updates made inside the details drawer
  const handleInvoiceUpdate = (updatedInvoice: Invoice) => {
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === updatedInvoice.id ? updatedInvoice : inv))
    );
    // Also update selected invoice to reflect changes in drawer if it's still open
    if (selectedInvoice && selectedInvoice.id === updatedInvoice.id) {
      setSelectedInvoice(updatedInvoice);
    }
  };

  const handleRowClick = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
  };

  const handleDeleteClick = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Avoid opening drawer on delete action
    if (!confirm('האם אתה בטוח שברצונך למחוק חשבונית זו? הקובץ המקושר ב-Google Drive יימחק גם הוא.')) {
      return;
    }

    try {
      const res = await fetch(`/api/invoices?id=${id}`, {
        method: 'DELETE',
      });

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
      }
    } catch (err) {
      console.error('Delete invoice error:', err);
      alert('שגיאה במחיקת מסמך החשבונית.');
    }
  };

  const handleCategoryChange = async (e: React.ChangeEvent<HTMLSelectElement>, invoiceId: string) => {
    e.stopPropagation();
    const newCategoryId = e.target.value;
    
    // Find the category object to optimistically update UI
    const selectedCat = categories.find(c => c.id === newCategoryId) || null;
    
    // Optimistic UI update
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

    // If it's also selected in drawer, update there too
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

  return (
    <div>
      {/* Search & Filters */}
      <div className="card animate-in" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-body" style={{ padding: 'var(--space-4)' }}>
          <div className="filter-bar">
            {/* Search Input */}
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

            {/* Status Select */}
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">כל הסטטוסים</option>
              <option value="new">חדש</option>
              <option value="partially_matched">התאמה חלקית</option>
              <option value="fully_matched">הותאם במלואו</option>
              <option value="processing">בעיבוד</option>
              <option value="error">שגיאה</option>
            </select>

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
            >
              <option value="">כל הקטגוריות</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>

            {/* Reset Button */}
            {(search || status || dateFrom || dateTo || minAmount || maxAmount || categoryId) && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSearch('');
                  setStatus('');
                  setDateFrom('');
                  setDateTo('');
                  setMinAmount('');
                  setMaxAmount('');
                  setCategoryId('');
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
                <th>שם ספק</th>
                <th>ח.פ/ע.מ</th>
                <th>תאריך חשבונית</th>
                <th>סכום כולל</th>
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
      />
    </div>
  );
}
