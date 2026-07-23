'use client';

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { CategoryStat } from '@/lib/supabase/types';

interface CategoryChartProps {
  data: CategoryStat[];
  loading?: boolean;
}

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function CategoryChart({ data, loading }: CategoryChartProps) {
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
              חלוקת סכומי ההוצאות והחשבוניות לפי סוגי הקטגוריות
            </p>
          </div>
          <div className="badge badge-accent" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, padding: '6px 12px' }}>
            סה״כ: {formatCurrency(totalSum)}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-6)', alignItems: 'center' }}>
          {/* Pie Chart */}
          <div style={{ height: '320px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={110}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any) => [formatCurrency(Number(val)), 'סכום הוצאה']}
                  contentStyle={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-text)',
                    direction: 'rtl',
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Detailed Category Table / Breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: '320px', overflowY: 'auto', paddingLeft: 'var(--space-2)' }}>
            {data.map((cat, index) => (
              <div
                key={cat.name}
                style={{
                  backgroundColor: 'var(--color-surface-hover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: COLORS[index % COLORS.length],
                        display: 'inline-block',
                      }}
                    />
                    <strong style={{ fontSize: 'var(--font-size-sm)' }}>{cat.name}</strong>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                      ({cat.count} חשבוניות)
                    </span>
                  </div>
                  <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)' }}>
                    {formatCurrency(cat.value)}
                  </strong>
                </div>

                {/* Progress bar */}
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
                        backgroundColor: COLORS[index % COLORS.length],
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', minWidth: '38px', textAlign: 'left' }}>
                    {cat.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
