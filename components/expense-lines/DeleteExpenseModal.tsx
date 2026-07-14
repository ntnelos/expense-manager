'use client';

import { useState } from 'react';
import type { ExpenseLine } from '@/lib/supabase/types';

interface DeleteExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (ignoreFuture: boolean) => Promise<void>;
  expenseLine: ExpenseLine | null;
}

export default function DeleteExpenseModal({ isOpen, onClose, onConfirm, expenseLine }: DeleteExpenseModalProps) {
  const [loading, setLoading] = useState(false);
  const [ignoreFuture, setIgnoreFuture] = useState(false);

  if (!isOpen || !expenseLine) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(ignoreFuture);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 'var(--font-size-xl)' }}>מחיקת שורת הוצאה</h2>
          <button className="btn-icon" onClick={onClose} style={{ fontSize: '1.5rem' }}>✕</button>
        </div>

        <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <p>האם אתה בטוח שברצונך למחוק את ההוצאה הבאה?</p>
          <div style={{ padding: 'var(--space-3)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)', margin: 'var(--space-3) 0' }}>
            <strong>תיאור:</strong> {expenseLine.description || 'ללא תיאור'}<br/>
            <strong>סכום:</strong> {expenseLine.amount} ₪
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', marginTop: 'var(--space-4)' }}>
            <input 
              type="checkbox" 
              checked={ignoreFuture} 
              onChange={(e) => setIgnoreFuture(e.target.checked)} 
              style={{ width: '16px', height: '16px' }}
            />
            <span style={{ fontSize: 'var(--font-size-sm)' }}>התעלם מסוג הוצאה זו לעתיד (לפי התיאור)</span>
          </label>
        </div>

        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>ביטול</button>
          <button className="btn" style={{ background: 'var(--color-danger)', color: 'white' }} onClick={handleConfirm} disabled={loading}>
            {loading ? 'מוחק...' : 'מחק'}
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
