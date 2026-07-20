'use client';

import { useState, useEffect } from 'react';
import type { ExpenseLine } from '@/lib/supabase/types';

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (note: string) => void;
  expenseLine: ExpenseLine | null;
}

export default function NoteModal({ isOpen, onClose, onSave, expenseLine }: NoteModalProps) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (expenseLine) {
      setNote(expenseLine.approval_note || '');
    }
  }, [expenseLine]);

  if (!isOpen || !expenseLine) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/expense-lines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: expenseLine.id, approval_note: note }),
      });
      if (!res.ok) throw new Error('Failed to save note');
      onSave(note);
      onClose();
    } catch (err) {
      console.error(err);
      alert('שגיאה בשמירת ההערה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="panel-backdrop open" onClick={onClose} />
      <div className="modal-content" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1001, width: '420px', maxWidth: '90vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700 }}>📝 הערה — {expenseLine.description || 'שורת הוצאה'}</h3>
          <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ padding: 'var(--space-1) var(--space-2)' }}>✕</button>
        </div>

        <textarea
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="הקלד הערה..."
          rows={4}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', padding: 'var(--space-3)' }}
          autoFocus
        />

        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
          <button className="btn btn-secondary" onClick={onClose}>ביטול</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'שומר...' : '💾 שמור הערה'}
          </button>
        </div>
      </div>
    </>
  );
}
