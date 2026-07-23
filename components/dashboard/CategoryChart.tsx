'use client';

import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryStat, CategoryInvoice } from '@/lib/supabase/types';
import { formatToIsraeliDate } from '@/lib/utils/dates';

interface CategoryChartProps {
  data: CategoryStat[];
  loading?: boolean;
}

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'
];

function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function translateInvoiceStatus(status: string) {
  switch (status) {
    case 'fully_matched': return { label: 'הותאם', cls: 'badge-success' };
    case 'partially_matched': return { label: 'הותאם חלקית', cls: 'badge-warning' };
    case 'approved_no_expense': return { label: 'אושר ללא הוצאה', cls: 'badge-primary' };
    case 'new': return { label: 'חדש', cls: 'badge-info' };
    case 'processing': return { label: 'בעיבוד', cls: 'badge-info' };
    default: return { label: status, cls: 'badge-secondary' };
  }
}

// Custom Tooltip component for Pie Chart
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data: CategoryStat = payload[0].payload;
    return (
      <div
        style={{
          backgroundColor: '#0F172A',
          color: '#FFFFFF',
          padding: '10px 14px',
          borderRadius: '8px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
          direction: 'rtl',
          border: '1px solid #334155',
          fontSize: '13px',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px', color: '#38BDF8' }}>
          {data.name}
        </div>
        <div>
          סכום כולל: <strong style={{ color: '#FACC15' }}>{formatCurrency(data.value)}</strong>
        </div>
        <div>
          כמות חשבוניות: <strong>{data.count}</strong> ({data.percentage.toFixed(1)}%)
        </div>
      </div>
    );
  }
  return null;
};

export default function CategoryChart({ data, loading }: CategoryChartProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="card" style={{ height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-6)' }}>
        <p>טוען התפלגות קטגוריות...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          🏷️ הוצאות החשבוניות לפי קטגוריות
        </h3>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-2)' }}>
          אין נתוני קטגוריות להצגה בתקופה הנבחרת
        </p>
      </div>
    );
  }

  const totalSum = data.reduce((sum, item) => sum + item.value, 0);

  const toggleAccordion = (catName: string) => {
    setExpandedCategory(prev => (prev === catName ? null : catName));
  };

  return (
    <div className="card animate-in" style={{ marginBottom: 'var(--space-6)' }}>
      <div className="card-body">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <div>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span>🏷️</span> הוצאות לפי קטגוריית חשבוניות
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 'var(--space-1) 0 0 0' }}>
              חלוקת סכומי ההוצאות והחשבוניות לפי סוגי הקטגוריות (לחץ על קטגוריה כדי לפתוח אקורדיון חשבוניות)
            </p>
          </div>
          <div className="badge badge-accent" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, padding: '6px 12px' }}>
            סה״כ: {formatCurrency(totalSum)}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-6)', alignItems: 'start' }}>
          
          {/* Pie Chart Section (Clean, no text overlap, hover tooltip only) */}
          <div style={{ height: '340px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={120}
                  paddingAngle={3}
                  dataKey="value"
                  label={false} // Disable slice text labels to prevent overlapping
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                      stroke="var(--color-surface)"
                      strokeWidth={2}
                      style={{ cursor: 'pointer', outline: 'none' }}
                      onClick={() => toggleAccordion(entry.name)}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '-15px' }}>
              💡 רחף מעל פלח בגרף או לחץ עליו לצפייה בפרטים
            </div>
          </div>

          {/* Left Side: Accordion Category List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxHeight: '450px', overflowY: 'auto', paddingLeft: 'var(--space-2)' }}>
            {data.map((cat, index) => {
              const isExpanded = expandedCategory === cat.name;
              const categoryColor = COLORS[index % COLORS.length];

              return (
                <div
                  key={cat.name}
                  style={{
                    backgroundColor: 'var(--color-surface-hover)',
                    border: `1px solid ${isExpanded ? categoryColor : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Accordion Header */}
                  <div
                    onClick={() => toggleAccordion(cat.name)}
                    style={{
                      padding: 'var(--space-3)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-2)',
                      backgroundColor: isExpanded ? 'var(--color-surface)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <span
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            backgroundColor: categoryColor,
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                        <strong style={{ fontSize: 'var(--font-size-sm)' }}>{cat.name}</strong>
                        <span className="badge badge-secondary" style={{ fontSize: '11px', padding: '2px 8px' }}>
                          {cat.count} חשבוניות
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <strong style={{ fontSize: 'var(--font-size-md)', color: 'var(--color-primary)' }}>
                          {formatCurrency(cat.value)}
                        </strong>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', transition: 'transform 0.2s ease', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                          ▼
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <div
                        style={{
                          flex: 1,
                          height: '6px',
                          backgroundColor: 'var(--color-border)',
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, Math.max(0, cat.percentage))}%`,
                            backgroundColor: categoryColor,
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', minWidth: '38px', textAlign: 'left' }}>
                        {cat.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Accordion Body — List of Invoices */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: 'var(--space-3)',
                        borderTop: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-surface)',
                      }}
                    >
                      <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                        📋 פירוט חשבוניות בקטגוריית {cat.name}:
                      </div>

                      {cat.invoices && cat.invoices.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                          {cat.invoices.map((inv: CategoryInvoice) => {
                            const statusInfo = translateInvoiceStatus(inv.status);
                            return (
                              <div
                                key={inv.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: 'var(--space-2) var(--space-3)',
                                  backgroundColor: 'var(--color-surface-hover)',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: 'var(--font-size-xs)',
                                  gap: 'var(--space-2)',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <strong style={{ color: 'var(--color-text)' }}>
                                    {inv.supplier_name || 'ספק לא ידוע'}
                                  </strong>
                                  <span style={{ color: 'var(--color-text-secondary)', fontSize: '11px' }}>
                                    תאריך: {inv.invoice_date ? formatToIsraeliDate(inv.invoice_date) : 'ללא תאריך'}
                                    {inv.invoice_number ? ` | מס׳ חשבונית: ${inv.invoice_number}` : ''}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                  <span className={`badge ${statusInfo.cls}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                                    {statusInfo.label}
                                  </span>
                                  <strong style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-sm)' }}>
                                    {formatCurrency(inv.total_amount)}
                                  </strong>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                          אין פירוט חשבוניות זמין לקטגוריה זו
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
