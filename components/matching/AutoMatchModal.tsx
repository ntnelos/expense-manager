'use client';

import { useState } from 'react';
import type { Invoice, ExpenseLine } from '@/lib/supabase/types';
import { formatToIsraeliDate } from '@/lib/utils/dates';

interface AutoMatchProposal {
  invoice: Invoice;
  line: ExpenseLine;
  score: number;
  selected: boolean;
}

interface AutoMatchModalProps {
  proposals: AutoMatchProposal[];
  onClose: () => void;
  onConfirm: (selectedMatches: AutoMatchProposal[]) => Promise<void>;
}

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(amount);
}

export default function AutoMatchModal({ proposals, onClose, onConfirm }: AutoMatchModalProps) {
  const [localProposals, setLocalProposals] = useState<AutoMatchProposal[]>(proposals);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const selectedCount = localProposals.filter(p => p.selected).length;
  const allSelected = selectedCount === localProposals.length;

  const toggleSelectAll = () => {
    setLocalProposals(prev => prev.map(p => ({ ...p, selected: !allSelected })));
  };

  const toggleRow = (index: number) => {
    setLocalProposals(prev => {
      const next = [...prev];
      next[index] = { ...next[index], selected: !next[index].selected };
      return next;
    });
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      const selected = localProposals.filter(p => p.selected);
      await onConfirm(selected);
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

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '900px', width: '90%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>
            🤖 התאמה אוטומטית ({proposals.length} הצעות)
          </h2>
          <button onClick={onClose} disabled={isProcessing} className="btn btn-secondary btn-sm" style={{ padding: 'var(--space-2)' }}>✕ סגור</button>
        </div>

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
              {localProposals.map((p, i) => (
                <tr key={i} style={{ opacity: p.selected ? 1 : 0.5, transition: 'opacity var(--transition-fast)' }}>
                  <td style={{ textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={p.selected} 
                      onChange={() => toggleRow(i)} 
                      disabled={isProcessing}
                      style={{ transform: 'scale(1.2)' }}
                    />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.invoice.supplier_name || 'ספק לא ידוע'}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      {formatToIsraeliDate(p.invoice.invoice_date)}
                    </div>
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--color-accent)' }}>
                    {formatCurrency(p.invoice.total_amount)}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.line.description || '—'}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      {formatToIsraeliDate(p.line.transaction_date)}
                    </div>
                  </td>
                  <td style={{ fontWeight: 700 }}>
                    {formatCurrency(p.line.amount)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ 
                      background: p.score >= 100 ? 'var(--color-success-muted)' : 'var(--color-warning-muted)', 
                      color: p.score >= 100 ? 'var(--color-success)' : 'var(--color-warning)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 600
                    }}>
                      {p.score >= 100 ? 'ודאות גבוהה' : 'בינונית'} ({p.score})
                    </span>
                  </td>
                </tr>
              ))}
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
