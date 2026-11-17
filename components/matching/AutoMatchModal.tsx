'use client';

import { useState } from 'react';
import type { Invoice, ExpenseLine } from '@/lib/supabase/types';
import type { MatchProposal } from '@/lib/matching/engine';
import { formatToIsraeliDate } from '@/lib/utils/dates';

type Proposal = MatchProposal<Invoice, ExpenseLine>;

interface AutoMatchModalProps {
  proposals: Proposal[];
  onClose: () => void;
  onConfirm: (selectedMatches: Proposal[]) => Promise<void>;
  onViewInvoice?: (invoice: Invoice) => void;
}

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(amount);
}

export default function AutoMatchModal({ proposals, onClose, onConfirm, onViewInvoice }: AutoMatchModalProps) {
  // High-confidence proposals start selected; medium ones need a deliberate tick.
  const [selected, setSelected] = useState<boolean[]>(() => proposals.map(p => p.confidence === 'high'));
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedCount = selected.filter(Boolean).length;
  const allSelected = selectedCount === proposals.length;

  const toggleSelectAll = () => setSelected(proposals.map(() => !allSelected));
  const toggleRow = (index: number) => setSelected(prev => prev.map((v, i) => (i === index ? !v : v)));

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirm(proposals.filter((_, i) => selected[i]));
    } finally {
      setIsProcessing(false);
    }
  };

  if (proposals.length === 0) {
    return (
      <div className="modal-backdrop">
        <div className="modal-content" style={{ maxWidth: '500px', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>🤷‍♂️</div>
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>לא נמצאו התאמות ברורות</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)' }}>
            לא הצלחנו למצוא התאמות ודאיות אוטומטיות. נסה להתאים ידנית.
          </p>
          <button onClick={onClose} className="btn btn-secondary">סגור</button>
        </div>
      </div>
    );
  }

  const highCount = proposals.filter(p => p.confidence === 'high').length;

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '980px', width: '90%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>
            🤖 התאמה אוטומטית ({proposals.length} הצעות)
          </h2>
          <button onClick={onClose} disabled={isProcessing} className="btn btn-secondary btn-sm" style={{ padding: 'var(--space-2)' }}>✕ סגור</button>
        </div>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
          ההצעות כוללות את כל החודשים. {highCount} בוודאות גבוהה מסומנות מראש; הצעות בוודאות בינונית - סמנו רק אחרי שבדקתם.
        </p>

        <div style={{ maxHeight: '60vh', overflowY: 'auto', marginBottom: 'var(--space-6)', border: '1px solid var(--color-glass-border)', borderRadius: 'var(--radius-md)' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--color-bg-secondary)', zIndex: 10 }}>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    disabled={isProcessing}
                    style={{ transform: 'scale(1.2)' }}
                  />
                </th>
                <th>חשבונית (במערכת)</th>
                <th>סכום חשבונית</th>
                <th>הוצאה (מהבנק)</th>
                <th>סכום הוצאה</th>
                <th style={{ textAlign: 'center' }}>רמת התאמה</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p, i) => {
                const invoiceSum = p.invoices.reduce((t, inv) => t + (inv.total_amount || 0), 0);
                const isInstallment = (p.line.installment_total || 0) > 1 && !!p.line.total_amount;
                return (
                  <tr key={`${p.line.id}-${i}`} style={{ opacity: selected[i] ? 1 : 0.55, transition: 'opacity var(--transition-fast)' }}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selected[i]}
                        onChange={() => toggleRow(i)}
                        disabled={isProcessing}
                        style={{ transform: 'scale(1.2)' }}
                      />
                    </td>
                    <td>
                      {p.invoices.map(inv => (
                        <div key={inv.id} style={{ marginBottom: p.invoices.length > 1 ? '4px' : 0 }}>
                          <div
                            style={{ fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}
                            onClick={(e) => { e.stopPropagation(); onViewInvoice?.(inv); }}
                            title="לחץ לצפייה בחשבונית"
                          >
                            {inv.supplier_name || 'ספק לא ידוע'}
                            {p.invoices.length > 1 && <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}> · {formatCurrency(inv.total_amount)}</span>}
                          </div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                            {formatToIsraeliDate(inv.invoice_date)}
                          </div>
                        </div>
                      ))}
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--color-accent)' }}>
                      {formatCurrency(invoiceSum)}
                      {p.invoices.length > 1 && (
                        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 400, color: 'var(--color-text-muted)' }}>סה״כ {p.invoices.length} חשבוניות</div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.line.description || '—'}</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        {formatToIsraeliDate(p.line.transaction_date)}
                      </div>
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {formatCurrency(p.line.amount)}
                      {isInstallment && (
                        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 400, color: 'var(--color-text-muted)' }}>
                          תשלום מתוך {p.line.installment_total} · סה״כ {formatCurrency(p.line.total_amount ?? null)}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        background: p.confidence === 'high' ? 'var(--color-success-muted)' : 'var(--color-warning-muted)',
                        color: p.confidence === 'high' ? 'var(--color-success)' : 'var(--color-warning)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}>
                        {p.confidence === 'high' ? 'ודאות גבוהה' : 'בינונית'}
                      </span>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
                        {p.reasons.join(' · ')}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg-secondary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--font-size-md)' }}>
              נבחרו לאישור: {selectedCount} מתוך {proposals.length}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button onClick={onClose} disabled={isProcessing} className="btn btn-secondary">ביטול</button>
            <button
              onClick={handleConfirm}
              disabled={isProcessing || selectedCount === 0}
              className="btn btn-primary"
            >
              {isProcessing ? 'מעבד...' : `אשר ${selectedCount} התאמות`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
