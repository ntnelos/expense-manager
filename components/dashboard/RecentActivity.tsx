'use client';

import type { Invoice, ExpenseLine } from '@/lib/supabase/types';
import StatusBadge from '@/components/ui/StatusBadge';

interface RecentActivityProps {
  invoices: Invoice[];
  expenseLines: ExpenseLine[];
  loading?: boolean;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(amount);
}

const SOURCE_ICONS: Record<string, string> = {
  email: '📧',
  telegram: '📱',
  manual_upload: '📤',
};

export default function RecentActivity({ invoices, expenseLines, loading }: RecentActivityProps) {
  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
        {[0, 1].map((i) => (
          <div key={i} className="card">
            <div className="card-header">
              <div className="skeleton" style={{ width: 140, height: 18 }} />
            </div>
            <div className="card-body">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="skeleton" style={{ height: 40, marginBottom: 'var(--space-3)' }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
      {/* Recent Invoices */}
      <div className="card animate-in">
        <div className="card-header">
          <h3 className="card-title">🧾 Recent Invoices</h3>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {invoices.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-10)' }}>
              <div className="empty-state-icon">🧾</div>
              <div className="empty-state-title">No invoices yet</div>
              <div className="empty-state-text">Upload your first invoice to get started</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Supplier</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>{SOURCE_ICONS[inv.source] || '📄'}</td>
                    <td>{inv.supplier_name || '—'}</td>
                    <td className="table-amount">
                      {inv.total_amount ? formatAmount(inv.total_amount) : '—'}
                    </td>
                    <td><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Recent Expense Lines */}
      <div className="card animate-in">
        <div className="card-header">
          <h3 className="card-title">🏦 Recent Expense Lines</h3>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {expenseLines.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-10)' }}>
              <div className="empty-state-icon">🏦</div>
              <div className="empty-state-title">No expense lines yet</div>
              <div className="empty-state-text">Import a bank CSV/Excel file to get started</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {expenseLines.map((line) => (
                  <tr key={line.id}>
                    <td className="table-date">{formatDate(line.transaction_date)}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {line.description || '—'}
                    </td>
                    <td className="table-amount">{formatAmount(line.amount)}</td>
                    <td><StatusBadge status={line.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
