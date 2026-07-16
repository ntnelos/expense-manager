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
}

export default function InvoiceDetailDrawer({ invoice, onClose, onUpdate }: InvoiceDetailDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Invoice>>({}); 
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  
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
        ocr_verified: invoice.ocr_verified,
      });
      setSelectedCategoryId((invoice as any).category_id || '');
      // Small timeout to allow transition
      setTimeout(() => setIsOpen(true), 50);
    } else {
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
        ocr_verified: verified ? true : formData.ocr_verified,
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
        if (verified) {
          handleClose();
        } else {
          setFormData({
            supplier_name: data.invoice.supplier_name || '',
            supplier_tax_id: data.invoice.supplier_tax_id || '',
            invoice_date: data.invoice.invoice_date || '',
            total_amount: data.invoice.total_amount || 0,
            vat_amount: data.invoice.vat_amount || 0,
            document_type: data.invoice.document_type || 'other',
            ocr_verified: data.invoice.ocr_verified,
          });
          setSelectedCategoryId(data.invoice.category_id || '');
        }
      }
    } catch (err: any) {
      setError(err.message || 'אירעה שגיאה בעת שמירת השינויים בחשבונית.');
    } finally {
      setSaving(false);
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
            <a
              href={invoice.drive_file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
            >
              🔗 פתח ב-Drive
            </a>
          </div>

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
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

              {/* Total Amount */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-1)' }}>
                  Total Amount (סה"כ כולל מע"מ)
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
            <button className="btn btn-secondary" onClick={handleClose} disabled={saving}>
              ביטול
            </button>
            <button className="btn btn-secondary" onClick={() => handleSave(false)} disabled={saving}>
              {saving ? 'שומר...' : 'שמור טיוטה'}
            </button>
            <button className="btn btn-primary" onClick={() => handleSave(true)} disabled={saving}>
              {saving ? 'מאמת...' : 'אמת ואשר OCR ✅'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
