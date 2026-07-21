'use client';

import { useState, useEffect } from 'react';
import type { Invoice } from '@/lib/supabase/types';
import StatusBadge from '../ui/StatusBadge';
import { formatToIsraeliDate } from '@/lib/utils/dates';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface InvoiceDetailDrawerProps {
  invoice: Invoice | null;
  onClose: () => void;
  onUpdate: (updatedInvoice: Invoice) => void;
  onDelete?: (id: string) => void;
}

export default function InvoiceDetailDrawer({ invoice, onClose, onUpdate, onDelete }: InvoiceDetailDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Invoice>>({}); 
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [matchedLines, setMatchedLines] = useState<any[]>([]);
  
  // Inline Alias States
  const [showAliasForm, setShowAliasForm] = useState(false);
  const [aliasName, setAliasName] = useState('');
  const [savingAlias, setSavingAlias] = useState(false);

  // Fetch categories on mount
  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (invoice) {
      setFormData({
        supplier_name: invoice.supplier_name || '',
        supplier_tax_id: invoice.supplier_tax_id || '',
        invoice_date: invoice.invoice_date || '',
        total_amount: invoice.total_amount || 0,
        vat_amount: invoice.vat_amount || 0,
        document_type: invoice.document_type || 'other',
        currency: invoice.currency || 'ILS',
        original_amount: invoice.original_amount || 0,
        rotation_angle: invoice.rotation_angle || 0,
      });
      setSelectedCategoryId((invoice as any).category_id || '');

      // Fetch matched lines if matched
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

      // Small timeout to allow transition
      setTimeout(() => setIsOpen(true), 50);
    } else {
      setMatchedLines([]);
      setIsOpen(false);
    }
  }, [invoice]);

  if (!invoice) return null;

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(onClose, 300); // Wait for transition out
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;

    if (type === 'number') {
      finalValue = value === '' ? 0 : parseFloat(value);
    }

    setFormData((prev) => ({ ...prev, [name]: finalValue }));
  };

  const handleSave = async (verified = false) => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        id: invoice.id,
        ...formData,
        category_id: selectedCategoryId || null,
        // Ensure original_amount is set correctly when saving
        original_amount: formData.currency !== 'ILS' ? formData.original_amount : null,
      };

      const res = await fetch('/api/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('שגיאה בעדכון נתוני החשבונית.');
      }

      const data = await res.json();
      if (data.success) {
        onUpdate(data.invoice);
        handleClose();
      }
    } catch (err: any) {
      setError(err.message || 'אירעה שגיאה בעת שמירת השינויים בחשבונית.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('האם אתה בטוח שברצונך למחוק חשבונית זו? הקובץ המקושר ב-Google Drive יימחק גם הוא.')) return;
    try {
      const res = await fetch(`/api/invoices?id=${invoice.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('שגיאה במחיקת החשבונית.');
      
      const data = await res.json();
      if (data.success) {
        if (onDelete) onDelete(invoice.id);
        handleClose();
      }
    } catch (err: any) {
      alert('שגיאה במחיקת מסמך החשבונית: ' + err.message);
    }
  };

  const calculateExchangeRate = async () => {
    if (!formData.invoice_date || !formData.currency || formData.currency === 'ILS' || !formData.original_amount) return;
    try {
      const response = await fetch(`https://api.frankfurter.dev/v1/${formData.invoice_date}?base=${formData.currency}&symbols=ILS`);
      if (response.ok) {
        const data = await response.json();
        if (data.rates && data.rates.ILS) {
          const rate = data.rates.ILS;
          setFormData(prev => ({
            ...prev,
            total_amount: Math.round(Number(prev.original_amount) * rate * 100) / 100
          }));
        }
      } else {
        alert('שגיאה במשיכת שער חליפין');
      }
    } catch (err) {
      console.error(err);
      alert('שגיאה בחישוב המרה');
    }
  };

  const getEmbedUrl = (url: string) => {
    if (!url) return '';
    
    // If it's a direct drive link, modify it for preview iframe
    if (url.includes('drive.google.com/file/d/')) {
      return url.replace('/view', '/preview');
    }
    return url;
  };

  const handleAddAlias = async () => {
    if (!formData.supplier_name || !aliasName) return;
    
    try {
      setSavingAlias(true);
      setError(null);
      
      const res = await fetch('/api/settings/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          original_name: formData.supplier_name, 
          alias_name: aliasName 
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'שגיאה בשמירת הכינוי');
      }

      // Automatically update the supplier name in the form
      setFormData(prev => ({ ...prev, supplier_name: aliasName }));
      setShowAliasForm(false);
      setAliasName('');
      
      // Also notify parent of the change so the grid updates instantly
      onUpdate({ ...invoice, supplier_name: aliasName } as Invoice);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingAlias(false);
    }
  };

  const handleUnmatch = async (expenseLineId: string) => {
    if (!invoice || !confirm('האם אתה בטוח שברצונך לבטל התאמה זו? החשבונית ושורת ההוצאה יחזרו לסטטוס ממתין.')) return;
    try {
      const res = await fetch(`/api/matches?invoiceId=${invoice.id}&expenseLineId=${expenseLineId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to unmatch');
      
      const data = await res.json();
      if (data.success) {
        setMatchedLines(prev => prev.filter(line => line.id !== expenseLineId));
        // Update local invoice status if returned
        if (data.invoiceStatus) {
           onUpdate({ ...invoice, status: data.invoiceStatus } as Invoice);
        }
      }
    } catch (err) {
      console.error(err);
      alert('שגיאה בביטול התאמה');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          zIndex: 900,
          opacity: isOpen ? 1 : 0,
          transition: 'opacity 0.3s ease-in-out',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        onClick={handleClose}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '90vw',
          maxWidth: '1200px',
          background: 'var(--color-bg-secondary)',
          borderLeft: '1px solid var(--color-glass-border)',
          boxShadow: 'var(--shadow-xl)',
          zIndex: 950,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          overflow: 'hidden',
        }}
      >
        {/* Left: Document Viewer */}
        <div
          style={{
            borderRight: '1px solid var(--color-glass-border)',
            background: '#151d30',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          <div
            style={{
              padding: 'var(--space-4) var(--space-6)',
              borderBottom: '1px solid var(--color-glass-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--color-bg-secondary)',
            }}
          >
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📄 {invoice.original_filename || 'מסמך חשבונית'}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm btn-icon"
                onClick={() => setFormData(prev => ({ ...prev, rotation_angle: ((prev.rotation_angle || 0) - 90) % 360 }))}
                title="סובב שמאלה"
              >
                ↺
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm btn-icon"
                onClick={() => setFormData(prev => ({ ...prev, rotation_angle: ((prev.rotation_angle || 0) + 90) % 360 }))}
                title="סובב ימינה"
              >
                ↻
              </button>
              <a
                href={invoice.drive_file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
              >
                🔗 פתח ב-Drive
              </a>
            </div>
          </div>

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyItems: 'center', background: '#151d30' }}>
            <div style={{ 
              width: '100%', 
              height: '100%',
              transform: `rotate(${formData.rotation_angle || 0}deg)`,
              transition: 'transform 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <iframe
                src={getEmbedUrl(invoice.drive_file_url)}
                width="100%"
                height="100%"
                style={{ border: 'none', background: '#151d30' }}
                title="Invoice Preview"
                allow="autoplay"
              />
            </div>
          </div>
        </div>

        {/* Right: OCR Details Form */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
          {/* Header */}
          <div
            style={{
              padding: 'var(--space-4) var(--space-6)',
              borderBottom: '1px solid var(--color-glass-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'sticky',
              top: 0,
              background: 'var(--color-bg-secondary)',
              zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>אימות נתוני OCR</span>
              <StatusBadge status={invoice.status} />
            </div>
            <button
              onClick={handleClose}
              style={{
                fontSize: '1.5rem',
                color: 'var(--color-text-secondary)',
                lineHeight: 1,
                padding: 'var(--space-1)',
              }}
            >
              ×
            </button>
          </div>

          {/* Form Content */}
          <div style={{ padding: 'var(--space-6)', flex: 1 }}>
            {error && (
              <div
                style={{
                  background: 'var(--color-error-muted)',
                  border: '1px solid var(--color-error)',
                  color: 'var(--color-error)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 'var(--space-4)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              {/* Supplier Name */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                  <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                    Supplier Name (שם העסק)
                  </label>
                  <button 
                    type="button" 
                    onClick={() => setShowAliasForm(!showAliasForm)}
                    style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    + הוסף כינוי (Alias)
                  </button>
                </div>
                <input
                  type="text"
                  name="supplier_name"
                  value={formData.supplier_name || ''}
                  onChange={handleInputChange}
                  style={{ width: '100%' }}
                />
                
                {showAliasForm && (
                  <div style={{ marginTop: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--color-bg-primary)', border: '1px solid var(--color-glass-border)', borderRadius: 'var(--radius-md)', display: 'flex', gap: 'var(--space-2)' }}>
                    <input 
                      type="text"
                      placeholder="הזן כינוי חדש (למשל: כביש 6)"
                      value={aliasName}
                      onChange={(e) => setAliasName(e.target.value)}
                      style={{ flex: 1, fontSize: 'var(--font-size-sm)', padding: 'var(--space-1) var(--space-2)' }}
                    />
                    <button 
                      type="button"
                      onClick={handleAddAlias}
                      disabled={savingAlias || !aliasName}
                      className="btn btn-primary btn-sm"
                    >
                      {savingAlias ? 'שומר...' : 'שמור'}
                    </button>
                  </div>
                )}
              </div>

              {/* Supplier Tax ID */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-1)' }}>
                  Supplier Tax ID / BN (ח.פ / עוסק מורשה)
                </label>
                <input
                  type="text"
                  name="supplier_tax_id"
                  value={formData.supplier_tax_id || ''}
                  onChange={handleInputChange}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Invoice Date */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-1)' }}>
                  Invoice Date (תאריך חשבונית)
                </label>
                <input
                  type="date"
                  name="invoice_date"
                  value={formData.invoice_date || ''}
                  onChange={handleInputChange}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Currency Selector */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-1)' }}>
                  Currency (מטבע)
                </label>
                <select
                  name="currency"
                  value={formData.currency || 'ILS'}
                  onChange={handleInputChange}
                  style={{ width: '100%' }}
                >
                  <option value="ILS">שקל חדש (ILS)</option>
                  <option value="USD">דולר אמריקאי (USD)</option>
                  <option value="EUR">אירו (EUR)</option>
                  <option value="GBP">לירה שטרלינג (GBP)</option>
                </select>
              </div>

              {/* Original Amount (Only if currency is not ILS) */}
              {formData.currency !== 'ILS' && (
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-1)' }}>
                    Original Amount ({formData.currency})
                  </label>
                  <div style={{ position: 'relative', display: 'flex', gap: 'var(--space-2)' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type="number"
                        step="0.01"
                        name="original_amount"
                        value={formData.original_amount || 0}
                        onChange={handleInputChange}
                        style={{ width: '100%', paddingLeft: 'var(--space-8)' }}
                      />
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }}>
                        {formData.currency === 'USD' ? '$' : formData.currency === 'EUR' ? '€' : formData.currency === 'GBP' ? '£' : formData.currency}
                      </span>
                    </div>
                    <button 
                      type="button" 
                      onClick={calculateExchangeRate}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '0 var(--space-4)' }}
                    >
                      💱 חשב שקלים
                    </button>
                  </div>
                </div>
              )}

              {/* Total Amount in ILS */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-1)' }}>
                  Total ILS (סה"כ בשקלים כולל מע"מ)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    step="0.01"
                    name="total_amount"
                    value={formData.total_amount || 0}
                    onChange={handleInputChange}
                    style={{ width: '100%', paddingLeft: 'var(--space-8)' }}
                  />
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }}>
                    ₪
                  </span>
                </div>
              </div>

              {/* VAT Amount */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-1)' }}>
                  VAT Amount (מע"מ)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    step="0.01"
                    name="vat_amount"
                    value={formData.vat_amount || 0}
                    onChange={handleInputChange}
                    style={{ width: '100%', paddingLeft: 'var(--space-8)' }}
                  />
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }}>
                    ₪
                  </span>
                </div>
              </div>

              {/* Document Type */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-1)' }}>
                  Document Type (סוג מסמך)
                </label>
                <select
                  name="document_type"
                  value={formData.document_type || 'other'}
                  onChange={handleInputChange}
                  style={{ width: '100%' }}
                >
                  <option value="tax_invoice">חשבונית מס</option>
                  <option value="receipt">קבלה</option>
                  <option value="tax_invoice_receipt">חשבונית מס קבלה</option>
                  <option value="other">אחר</option>
                </select>
              </div>

              {/* Category */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-1)' }}>
                  Category (קטגוריה)
                </label>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">ללא קטגוריה</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Metadata Read-Only */}
              <div
                style={{
                  marginTop: 'var(--space-4)',
                  padding: 'var(--space-4)',
                  background: 'var(--color-glass)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-glass-border)',
                  fontSize: 'var(--font-size-sm)',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--space-2)',
                }}
              >
                <div>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: 'var(--font-size-xs)' }}>מקור</span>
                  <strong>{invoice.source === 'email' ? '📧 דוא״ל' : invoice.source === 'telegram' ? '📱 Telegram' : '📤 רשת'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: 'var(--font-size-xs)' }}>תאריך העלאה</span>
                  <strong>{formatToIsraeliDate(invoice.created_at)}</strong>
                </div>
                <div style={{ gridColumn: 'span 2', wordBreak: 'break-all' }}>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: 'var(--font-size-xs)' }}>מזהה תוכן (SHA-256)</span>
                  <code style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{invoice.content_hash}</code>
                </div>
              </div>
            </div>

            {/* Matched Expense Lines */}
            {matchedLines.length > 0 && (
              <div style={{ marginTop: 'var(--space-6)' }}>
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>שורות הוצאה שהותאמו</h3>
                {matchedLines.map((line, idx) => (
                  <div key={line.id || idx} style={{
                    padding: 'var(--space-3)',
                    background: 'var(--color-bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-2)',
                    fontSize: 'var(--font-size-sm)',
                    border: '1px solid var(--color-glass-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                      <span>{line.description}</span>
                      <span style={{ color: 'var(--color-accent)', textAlign: 'left' }}>
                        <div>{new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(line.amount)}</div>
                        {line.total_amount && line.total_amount !== line.amount && (
                          <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontWeight: 400, marginTop: '2px' }}>
                            {line.currency !== 'ILS'
                              ? `(${line.total_amount} ${line.currency})`
                              : `(מתוך ${new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(line.total_amount)})`
                            }
                            {line.installment_current && line.installment_total ? ` (תשלום ${line.installment_current}/${line.installment_total})` : ''}
                          </div>
                        )}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                        תאריך עסקה: {formatToIsraeliDate(line.transaction_date)}
                      </span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleUnmatch(line.id)}
                        style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--color-error)' }}
                      >
                        ביטול התאמה 🚫
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div
            style={{
              padding: 'var(--space-4) var(--space-6)',
              borderTop: '1px solid var(--color-glass-border)',
              display: 'flex',
              gap: 'var(--space-3)',
              justifyContent: 'flex-end',
              background: 'var(--color-bg-secondary)',
              position: 'sticky',
              bottom: 0,
              zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className="btn btn-secondary" onClick={handleClose} disabled={saving}>
                ביטול
              </button>
              <button className="btn btn-secondary" style={{ color: 'var(--color-danger)' }} onClick={handleDelete} disabled={saving}>
                🗑️ מחיקה
              </button>
            </div>
            <button className="btn btn-primary" onClick={() => handleSave(false)} disabled={saving}>
              {saving ? 'שומר...' : 'שמור שינויים'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
