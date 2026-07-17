'use client';

import { useState, useEffect } from 'react';
import type { Invoice } from '@/lib/supabase/types';

interface ApproveNoExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
  invoices: Invoice[];
}

export default function ApproveNoExpenseModal({ isOpen, onClose, onConfirm, invoices }: ApproveNoExpenseModalProps) {
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setNote('');
    }
  }, [isOpen]);

  if (!isOpen || invoices.length === 0) return null;

  const handleConfirm = async () => {
    if (!note.trim()) {
      alert('חובה למלא סיבת אישור (למשל: חשבונית שלא שולמה מהחשבון העסקי).');
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
          <h2 style={{ fontSize: 'var(--font-size-xl)' }}>אישור חשבונית ללא הוצאה</h2>
          <button className="btn-icon" onClick={onClose} style={{ fontSize: '1.5rem' }}>✕</button>
        </div>

        <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <p>
            אתה עומד לאשר {invoices.length === 1 ? 'חשבונית אחת' : `${invoices.length} חשבוניות`} ללא שיוך לשורת הוצאה בבנק.
          </p>
          <div style={{ padding: 'var(--space-3)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)', margin: 'var(--space-3) 0', maxHeight: '120px', overflowY: 'auto' }}>
            {invoices.slice(0, 3).map(inv => (
              <div key={inv.id} style={{ marginBottom: '4px', fontSize: 'var(--font-size-sm)' }}>
                <strong>{inv.supplier_name || 'ספק לא ידוע'}</strong> - {inv.total_amount} ₪
              </div>
            ))}
            {invoices.length > 3 && (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>ועוד {invoices.length - 3} חשבוניות...</div>
            )}
          </div>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
              סיבת אישור (חובה)
            </label>
            <input 
              type="text" 
              className="input" 
              placeholder="לדוגמא: שולם מהחשבון הפרטי"
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
            {loading ? 'מאשר...' : 'אישור חשבונית'}
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
