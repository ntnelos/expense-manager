'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { ChargeDateStat } from '@/lib/supabase/types';
import { formatToIsraeliDate } from '@/lib/utils/dates';

interface ChargeDatesChartProps {
  data: ChargeDateStat[];
  loading?: boolean;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const BAR_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#6366F1'];

export default function ChargeDatesChart({ data, loading }: ChargeDatesChartProps) {
  if (loading) {
    return (
      <div className="card" style={{ height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-6)' }}>
        <p>טוען נתוני תאריכי חיוב...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          📅 סכום הוצאה כולל לכל תאריך חיוב
        </h3>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-2)' }}>
          אין שורות הוצאה להצגה בתקופת החיוב הנבחרת
        </p>
      </div>
    );
  }

  // Format dates for display
  const chartData = data.map(item => ({
    ...item,
    formattedDate: item.charge_date ? formatToIsraeliDate(item.charge_date) : 'ללא תאריך',
  }));

  const totalPeriodSum = data.reduce((sum, item) => sum + item.total_amount, 0);

  return (
    <div className="card animate-in" style={{ marginBottom: 'var(--space-6)' }}>
      <div className="card-body">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <div>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span>📅</span> סכום הוצאה לפי תאריכי חיוב בבנק
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 'var(--space-1) 0 0 0' }}>
              פילוג סכומי החיוב הכוללים לפי מועדי החיוב של כרטיסי האשראי והבנק
            </p>
          </div>
          <div className="badge badge-primary" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, padding: '6px 12px' }}>
            סה״כ חיוביים: {formatCurrency(totalPeriodSum)}
          </div>
        </div>

        {/* Bar Chart */}
        <div style={{ height: '300px', width: '100%', marginBottom: 'var(--space-5)' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis
                dataKey="formattedDate"
                tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
                axisLine={{ stroke: 'var(--color-border)' }}
              />
              <YAxis
                tickFormatter={(value) => `₪${(value / 1000).toFixed(0)}k`}
                tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
                axisLine={{ stroke: 'var(--color-border)' }}
              />
              <Tooltip
                formatter={(value: any) => [formatCurrency(Number(value)), 'סך חיוב']}
                labelFormatter={(label) => `תאריך חיוב: ${label}`}
                contentStyle={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text)',
                  direction: 'rtl',
                }}
              />
              <Bar dataKey="total_amount" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Breakdown Table / Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
          {chartData.map((item, index) => {
            const isFullyMatched = item.matched_lines === item.total_lines;
            return (
              <div
                key={item.charge_date}
                style={{
                  backgroundColor: 'var(--color-surface-hover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3)',
                  borderRight: `4px solid ${BAR_COLORS[index % BAR_COLORS.length]}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    מועד חיוב
                  </span>
                  <span
                    className={`badge ${isFullyMatched ? 'badge-success' : 'badge-warning'}`}
                    style={{ fontSize: '10px', padding: '2px 6px' }}
                  >
                    {isFullyMatched ? 'הכל הותאם' : `${item.matched_lines}/${item.total_lines} הותאמו`}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, marginBottom: 'var(--space-1)' }}>
                  {item.formattedDate}
                </div>
                <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, color: 'var(--color-primary)' }}>
                  {formatCurrency(item.total_amount)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
