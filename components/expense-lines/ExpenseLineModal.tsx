'use client';

import { useState, useEffect } from 'react';
import type { ExpenseLine } from '@/lib/supabase/types';

interface ExpenseLineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  expenseLine?: ExpenseLine | null;
}

export default function ExpenseLineModal({ isOpen, onClose, onSave, expenseLine }: ExpenseLineModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [transactionDate, setTransactionDate] = useState('');
  const [amount, setAmount] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('ILS');
  const [cardLastDigits, setCardLastDigits] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (expenseLine) {
        setTransactionDate(expenseLine.transaction_date.substring(0, 10));
        setAmount(expenseLine.amount.toString());
        setTotalAmount(expenseLine.total_amount ? expenseLine.total_amount.toString() : '');
        setDescription(expenseLine.description || '');
        setCurrency(expenseLine.currency || 'ILS');
        setCardLastDigits(expenseLine.card_last_digits || '');
      } else {
        // Defaults for new line
        setTransactionDate(new Date().toISOString().substring(0, 10));
        setAmount('');
        setTotalAmount('');
        setDescription('');
        setCurrency('ILS');
        setCardLastDigits('');
      }
      setError('');
    }
  }, [isOpen, expenseLine]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionDate || !amount) {
      setError('תאריך עסקה וסכום הם שדות חובה.');
      return;
    }

    setLoading(true);
    setError('');

    const payload = {
      id: expenseLine?.id,
      transaction_date: transactionDate,
      amount: parseFloat(amount),
      total_amount: totalAmount ? parseFloat(totalAmount) : null,
      description: description.trim(),
      currency,
      card_last_digits: cardLastDigits.trim() || null,
    };

    try {
      const method = expenseLine ? 'PATCH' : 'POST';
      const res = await fetch('/api/expense-lines', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'אירעה שגיאה בשמירת השורה');
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 'var(--font-size-xl)' }}>{expenseLine ? 'ערוך שורת הוצאה' : 'הוסף שורת הוצאה ידנית'}</h2>
          <button className="btn-icon" onClick={onClose} style={{ fontSize: '1.5rem' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          {error && <div className="error-message">{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--space-2)' }}>תאריך עסקה *</label>
              <input 
                type="date" 
                className="input-field" 
                value={transactionDate} 
                onChange={(e) => setTransactionDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--space-2)' }}>מטבע</label>
              <select className="input-field" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="ILS">שקל (ILS)</option>
                <option value="USD">דולר (USD)</option>
                <option value="EUR">אירו (EUR)</option>
                <option value="GBP">פאונד (GBP)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--space-2)' }}>סכום חיוב (בשקלים) *</label>
              <input 
                type="number" 
                step="0.01" 
                className="input-field" 
                value={amount} 
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
                סכום עסקה {currency !== 'ILS' && `(ב-${currency})`}
              </label>
              <input 
                type="number" 
                step="0.01" 
                className="input-field" 
                value={totalAmount} 
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--space-2)' }}>תיאור / בית עסק</label>
            <input 
              type="text" 
              className="input-field" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--space-2)' }}>4 ספרות כרטיס</label>
            <input 
              type="text" 
              className="input-field" 
              maxLength={4}
              value={cardLastDigits} 
              onChange={(e) => setCardLastDigits(e.target.value)}
            />
          </div>

          <div className="modal-actions" style={{ marginTop: 'var(--space-4)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>ביטול</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </form>
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
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-3);
        }
        .error-message {
          color: var(--color-danger);
          background: var(--color-danger-muted);
          padding: var(--space-3);
          border-radius: var(--radius-md);
          font-size: var(--font-size-sm);
        }
      `}</style>
    </div>
  );
}
