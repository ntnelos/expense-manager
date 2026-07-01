'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Invoice } from '@/lib/supabase/types';
import StatusBadge from '../ui/StatusBadge';
import { formatToIsraeliDate } from '@/lib/utils/dates';
import InvoiceDetailDrawer from './InvoiceDetailDrawer';

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
  const [limit] = useState(15);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  // Selected Invoice for Drawer
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

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
      });

      const res = await fetch(`/api/invoices?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch invoices list.');
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
  }, [page, limit, search, status, dateFrom, dateTo, minAmount, maxAmount]);

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
    if (!confirm('Are you sure you want to delete this invoice? The associated file in Google Drive will also be removed.')) {
      return;
    }

    try {
      const res = await fetch(`/api/invoices?id=${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete invoice.');
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
      alert('Failed to delete invoice document.');
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
              placeholder="Search by supplier name, tax ID..."
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
              <option value="">All Statuses</option>
              <option value="new">New</option>
              <option value="partially_matched">Partial Match</option>
              <option value="fully_matched">Fully Matched</option>
              <option value="processing">Processing</option>
              <option value="error">Error</option>
            </select>

            {/* Date From */}
            <input
              type="date"
              placeholder="Date From"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
            />

            {/* Date To */}
            <input
              type="date"
              placeholder="Date To"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
            />

            {/* Min Amount */}
            <input
              type="number"
              placeholder="Min Amount (₪)"
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
              placeholder="Max Amount (₪)"
              value={maxAmount}
              onChange={(e) => {
                setMaxAmount(e.target.value);
                setPage(1);
              }}
              style={{ maxWidth: '130px' }}
            />

            {/* Reset Button */}
            {(search || status || dateFrom || dateTo || minAmount || maxAmount) && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSearch('');
                  setStatus('');
                  setDateFrom('');
                  setDateTo('');
                  setMinAmount('');
                  setMaxAmount('');
                  setPage(1);
                }}
              >
                Clear
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
            <div className="empty-state-title">No invoices found</div>
            <div className="empty-state-text">
              Try adjusting your search query or filters, or upload a new invoice.
            </div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Supplier Name</th>
                <th>Tax ID</th>
                <th>Invoice Date</th>
                <th>Total Amount</th>
                <th>VAT Amount</th>
                <th>Matched</th>
                <th>Status</th>
                <th>Verified</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
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
                  <td className="table-amount" style={{ color: 'var(--color-success)' }}>
                    {formatCurrency(inv.matched_amount)}
                  </td>
                  <td>
                    <StatusBadge status={inv.status} />
                  </td>
                  <td>
                    {inv.ocr_verified ? (
                      <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>✅ Yes</span>
                    ) : (
                      <span style={{ color: 'var(--color-warning)', fontWeight: 500 }}>⏳ Draft</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={(e) => handleDeleteClick(e, inv.id)}
                      title="Delete Invoice"
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
            Showing <strong>{invoices.length}</strong> of <strong>{totalCount}</strong> invoices
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page === 1}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            >
              Previous
            </button>
            <span style={{ alignSelf: 'center', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </span>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page === totalPages}
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            >
              Next
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
