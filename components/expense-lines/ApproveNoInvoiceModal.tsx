'use client';

import { useState, useEffect } from 'react';
import type { ExpenseLine } from '@/lib/supabase/types';

interface ApproveNoInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
  expenseLines: ExpenseLine[];
}

export default function ApproveNoInvoiceModal({ isOpen, onClose, onConfirm, expenseLines }: ApproveNoInvoiceModalProps) {
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setNote('');
    }
  }, [isOpen]);

  if (!isOpen || expenseLines.length === 0) return null;

  const handleConfirm = async () => {
    if (!note.trim()) {
      alert('חובה למלא סיבת אישור (למשל: העברה בביט לפרטי).');
      return;
    }
    
    setLoading(true);
    try {
      await onConfirm(note.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 'var(--font-size-xl)' }}>אישור ללא חשבונית</h2>
          <button className="btn-icon" onClick={onClose} style={{ fontSize: '1.5rem' }}>✕</button>
        </div>

        <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <p>
            אתה עומד לאשר {expenseLines.length === 1 ? 'שורת הוצאה אחת' : `${expenseLines.length} שורות הוצאה`} ללא חשבונית.
          </p>
          <div style={{ padding: 'var(--space-3)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)', margin: 'var(--space-3) 0', maxHeight: '120px', overflowY: 'auto' }}>
            {expenseLines.slice(0, 3).map(line => (
              <div key={line.id} style={{ marginBottom: '4px', fontSize: 'var(--font-size-sm)' }}>
                <strong>{line.description || 'ללא תיאור'}</strong> - {line.amount} ₪
              </div>
            ))}
            {expenseLines.length > 3 && (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>ועוד {expenseLines.length - 3} שורות...</div>
            )}
          </div>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
              סיבת אישור (חובה)
            </label>
            <input 
              type="text" 
              className="input" 
              placeholder="לדוגמא: העברה בביט לחשבון הפרטי"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ width: '100%' }}
              autoFocus
            />
          </div>
        </div>

        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>ביטול</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={loading}>
            {loading ? 'מאשר...' : 'אישור הוצאה'}
          </button>
        </div>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: var(--space-4);
        }
        .modal-content {
          background: var(--color-bg-primary);
          padding: var(--space-6);
          border-radius: var(--radius-lg);
          width: 100%;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--color-border);
          padding-bottom: var(--space-4);
        }
      `}</style>
    </div>
  );
}
