'use client';

import FileUploader from './FileUploader';
import type { ExpenseLine } from '@/lib/supabase/types';

interface DirectUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  expenseLine: ExpenseLine | null;
  onUploadSuccess: (invoice: any, expenseLineId: string) => Promise<void>;
}

export default function DirectUploadModal({ isOpen, onClose, expenseLine, onUploadSuccess }: DirectUploadModalProps) {
  if (!isOpen || !expenseLine) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 'var(--font-size-xl)' }}>העלאת חשבונית לשורה: {expenseLine.description}</h2>
          <button className="btn-icon" onClick={onClose} style={{ fontSize: '1.5rem' }}>✕</button>
        </div>

        <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <p style={{ marginBottom: 'var(--space-4)' }}>
            סכום ההוצאה: <strong>{expenseLine.amount} ₪</strong>
            <br />
            העלה חשבונית לכאן והיא תותאם אוטומטית לשורת הוצאה זו לאחר סיום הפענוח.
          </p>
          
          <FileUploader 
            source="manual_upload"
            onUploadSuccess={(invoice) => {
              // Wait for the modal to close or show progress, but we can just call it
              onUploadSuccess(invoice, expenseLine.id);
            }}
          />
        </div>

        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <button className="btn btn-secondary" onClick={onClose}>סגור</button>
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
          max-height: 90vh;
          overflow-y: auto;
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
