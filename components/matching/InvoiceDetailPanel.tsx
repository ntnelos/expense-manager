'use client';

import { useState, useEffect } from 'react';
import type { Invoice } from '@/lib/supabase/types';
import { formatToIsraeliDate } from '@/lib/utils/dates';

interface InvoiceDetailPanelProps {
  invoice: Invoice | null;
  onClose: () => void;
  onSaved?: () => void;
}

function formatCurrency(amount: number | null, currency: string = 'ILS'): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: currency || 'ILS',
  }).format(amount);
}

function getSourceLabel(source: string | null) {
  switch (source) {
    case 'email': return '📧 אימייל';
    case 'telegram': return '📱 טלגרם';
    case 'manual_upload': return '📤 העלאה ידנית';
    default: return source || '—';
  }
}

function getDocTypeLabel(docType: string | null) {
  switch (docType) {
    case 'tax_invoice': return 'חשבונית מס';
    case 'receipt': return 'קבלה';
    case 'tax_invoice_receipt': return 'חשבונית מס / קבלה';
    case 'other': return 'אחר';
    default: return '—';
  }
}

export default function InvoiceDetailPanel({ invoice, onClose, onSaved }: InvoiceDetailPanelProps) {
  const isOpen = !!invoice;
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [matchedLines, setMatchedLines] = useState<any[]>([]);

  
  const [formData, setFormData] = useState({
    supplier_name: '',
    invoice_number: '',
    invoice_date: '',
    total_amount: '',
    currency: 'ILS',
  });

  // Reset form when invoice changes
  useEffect(() => {
    if (invoice) {
      setFormData({
        supplier_name: invoice.supplier_name || '',
        invoice_number: invoice.invoice_number || '',
        invoice_date: invoice.invoice_date || '',
        total_amount: invoice.total_amount?.toString() || '',
        currency: invoice.currency || 'ILS',
      });
      // Auto-open edit mode if it's an error invoice
      setIsEditing(invoice.status === 'error');

      // Fetch matched expense lines if matched
      if (invoice.status === 'fully_matched' || invoice.status === 'partially_matched') {
        fetch(`/api/matches?invoiceId=${invoice.id}`)
          .then(res => res.json())
          .then(data => {
            if (data.matches) {
              setMatchedLines(data.matches.map((m: any) => m.expense_line).filter(Boolean));
            }
          })
          .catch(console.error);
      } else {
        setMatchedLines([]);
      }
    } else {
      setMatchedLines([]);
    }
  }, [invoice]);

  const handleSave = async () => {
    if (!invoice) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_name: formData.supplier_name,
          invoice_number: formData.invoice_number,
          invoice_date: formData.invoice_date,
          total_amount: formData.total_amount ? parseFloat(formData.total_amount) : null,
          currency: formData.currency,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update invoice');
      }

      setIsEditing(false);
      if (onSaved) onSaved();
    } catch (err) {
      console.error(err);
      alert('שגיאה בשמירת הנתונים');
    } finally {
      setIsSaving(false);
    }
  };

  const detailItemStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
    borderBottom: '1px solid var(--color-glass-border)',
    fontSize: 'var(--font-size-xs)',
  };

  const labelStyle: React.CSSProperties = {
    color: 'var(--color-text-muted)',
    fontWeight: 500,
    flexShrink: 0,
  };

  const valueStyle: React.CSSProperties = {
    fontWeight: 600,
    textAlign: 'left',
  };

  return (
    <>
      <div 
        className={`panel-backdrop ${isOpen ? 'open' : ''}`} 
        onClick={onClose}
      />

      <div className={`slide-panel ${isOpen ? 'open' : ''}`}>
        <div className="slide-panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>
              פרטי חשבונית
            </h2>
            {invoice?.status === 'error' && (
              <span style={{ background: 'var(--color-warning-muted)', color: 'var(--color-warning)', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
                ⚠️ זיהוי נכשל
              </span>
            )}
          </div>
          <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ padding: 'var(--space-2)' }}>
            ✕ סגור
          </button>
        </div>

        {invoice && (
          <div className="slide-panel-content">
            {/* Document Preview — TOP */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              {invoice.drive_file_url ? (
                <div style={{ height: '400px', width: '100%', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-glass-border)' }}>
                  <iframe 
                    src={invoice.drive_file_url.replace('/view', '/preview')} 
                    width="100%" 
                    height="100%" 
                    allow="autoplay"
                    style={{ border: 'none' }}
                  />
                </div>
              ) : (
                <div className="empty-state" style={{ padding: 'var(--space-4)' }}>
                  לא נמצא קישור למסמך המקורי ב-Drive
                </div>
              )}
            </div>

            {/* Details Card — BELOW */}
            <div className="detail-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700 }}>מידע כללי</h3>
                {!isEditing ? (
                  <button type="button" onClick={() => setIsEditing(true)} className="btn btn-secondary btn-sm" style={{ padding: '2px 8px' }}>✏️ ערוך</button>
                ) : (
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button type="button" onClick={() => setIsEditing(false)} className="btn btn-secondary btn-sm" style={{ padding: '2px 8px' }}>ביטול</button>
                    <button type="submit" form="invoice-edit-form" disabled={isSaving} className="btn btn-primary btn-sm" style={{ padding: '2px 8px' }}>{isSaving ? 'שומר...' : '💾 שמור'}</button>
                  </div>
                )}
              </div>

              <form id="invoice-edit-form" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                {/* Editable Fields */}
                <div style={detailItemStyle}>
                  <span style={labelStyle}>ספק</span>
                  {isEditing ? (
                    <input type="text" className="input" value={formData.supplier_name} onChange={e => setFormData({...formData, supplier_name: e.target.value})} style={{ textAlign: 'left', padding: '4px', maxWidth: '200px' }} />
                  ) : (
                    <span style={valueStyle}>{invoice.supplier_name || '—'}</span>
                  )}
                </div>
                
                <div style={detailItemStyle}>
                  <span style={labelStyle}>מספר חשבונית</span>
                  {isEditing ? (
                    <input type="text" className="input" value={formData.invoice_number} onChange={e => setFormData({...formData, invoice_number: e.target.value})} style={{ textAlign: 'left', padding: '4px', maxWidth: '150px' }} />
                  ) : (
                    <span style={valueStyle}>{invoice.invoice_number || '—'}</span>
                  )}
                </div>
                
                <div style={detailItemStyle}>
                  <span style={labelStyle}>תאריך חשבונית</span>
                  {isEditing ? (
                    <input type="date" className="input" value={formData.invoice_date} onChange={e => setFormData({...formData, invoice_date: e.target.value})} style={{ textAlign: 'left', padding: '4px', maxWidth: '150px' }} />
                  ) : (
                    <span style={valueStyle}>{formatToIsraeliDate(invoice.invoice_date)}</span>
                  )}
                </div>

                <div style={detailItemStyle}>
                  <span style={labelStyle}>סכום כולל</span>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <input type="number" step="0.01" className="input" value={formData.total_amount} onChange={e => setFormData({...formData, total_amount: e.target.value})} style={{ textAlign: 'left', padding: '4px', maxWidth: '100px' }} />
                      <select className="input" value={formData.currency} onChange={e => setFormData({...formData, currency: e.target.value})} style={{ padding: '4px' }}>
                        <option value="ILS">₪ ILS</option>
                        <option value="USD">$ USD</option>
                        <option value="EUR">€ EUR</option>
                      </select>
                    </div>
                  ) : (
                    <span style={{ ...valueStyle, color: 'var(--color-accent)', fontWeight: 700, fontSize: 'var(--font-size-md)' }}>
                      {formatCurrency(invoice.total_amount, invoice.currency || 'ILS')}
                    </span>
                  )}
                </div>
              </form>

              {/* Read-only fields */}
              <div style={{ ...detailItemStyle, marginTop: 'var(--space-2)' }}>
                <span style={labelStyle}>ח.פ / ע.מ</span>
                <span style={valueStyle}>{invoice.supplier_tax_id || '—'}</span>
              </div>
              <div style={detailItemStyle}>
                <span style={labelStyle}>סוג מסמך</span>
                <span style={valueStyle}>{getDocTypeLabel(invoice.document_type)}</span>
              </div>
              <div style={detailItemStyle}>
                <span style={labelStyle}>מקור</span>
                <span style={valueStyle}>{getSourceLabel(invoice.source)}</span>
              </div>
              <div style={detailItemStyle}>
                <span style={labelStyle}>מע״מ</span>
                <span style={valueStyle}>{formatCurrency(invoice.vat_amount, 'ILS')}</span>
              </div>
              {invoice.original_amount && invoice.currency && invoice.currency !== 'ILS' && (
                <div style={detailItemStyle}>
                  <span style={labelStyle}>סכום מקורי</span>
                  <span style={valueStyle}>{formatCurrency(invoice.original_amount, invoice.currency)} ({invoice.currency})</span>
                </div>
              )}
              <div style={detailItemStyle}>
                <span style={labelStyle}>סכום שהותאם</span>
                <span style={{ ...valueStyle, color: 'var(--color-success)' }}>{formatCurrency(invoice.matched_amount, 'ILS')}</span>
              </div>
              <div style={detailItemStyle}>
                <span style={labelStyle}>תאריך העלאה</span>
                <span style={valueStyle}>{formatToIsraeliDate(invoice.created_at)}</span>
              </div>
              <div style={{ ...detailItemStyle, borderBottom: 'none' }}>
                <span style={labelStyle}>קובץ מקורי</span>
                <span style={{ ...valueStyle, fontSize: '11px' }}>{invoice.original_filename || '—'}</span>
              </div>
            </div>

            {/* Matched Expense Lines */}
            {matchedLines.length > 0 && (
              <div className="detail-card" style={{ marginTop: 'var(--space-4)' }}>
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>שורות הוצאה שהותאמו</h3>
                {matchedLines.map((line, idx) => (
                  <div key={line.id || idx} style={{
                    padding: 'var(--space-2)',
                    background: 'var(--color-bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-2)',
                    fontSize: 'var(--font-size-xs)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                      <span>{line.description}</span>
                      <span>{formatCurrency(line.amount)}</span>
                    </div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '11px', marginTop: '2px' }}>
                      תאריך עסקה: {formatToIsraeliDate(line.transaction_date)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
