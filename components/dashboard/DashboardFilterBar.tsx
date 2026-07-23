'use client';

import React from 'react';

export interface DashboardFilterState {
  mode: 'month' | 'range' | 'year' | 'all';
  month: string;
  fromMonth: string;
  toMonth: string;
  year: string;
}

interface DashboardFilterBarProps {
  filter: DashboardFilterState;
  availableMonths: string[];
  onChange: (newFilter: DashboardFilterState) => void;
  loading?: boolean;
}

export default function DashboardFilterBar({
  filter,
  availableMonths,
  onChange,
  loading = false,
}: DashboardFilterBarProps) {
  // Available years derived from available months
  const availableYears = Array.from(
    new Set(availableMonths.map(m => m.split('-')[0]))
  ).sort().reverse();

  // Hebrew month formatter
  const formatMonthHebrew = (mStr: string) => {
    if (!mStr || !mStr.includes('-')) return mStr;
    const [y, m] = mStr.split('-');
    const monthsHeb = [
      'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
      'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
    ];
    const monthName = monthsHeb[parseInt(m, 10) - 1] || m;
    return `${monthName} ${y}`;
  };

  const handleModeChange = (mode: 'month' | 'range' | 'year' | 'all') => {
    onChange({ ...filter, mode });
  };

  const setPreset = (preset: 'current' | 'last' | 'all') => {
    if (preset === 'all') {
      onChange({ ...filter, mode: 'all' });
      return;
    }

    const today = new Date();
    if (preset === 'current') {
      const curMonth = availableMonths[0] || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      onChange({ ...filter, mode: 'month', month: curMonth });
    } else if (preset === 'last') {
      const lastMonth = availableMonths[1] || availableMonths[0] || `${today.getFullYear()}-${String(today.getMonth()).padStart(2, '0')}`;
      onChange({ ...filter, mode: 'month', month: lastMonth });
    }
  };

  return (
    <div
      className="card animate-in"
      style={{
        marginBottom: 'var(--space-6)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
        }}
      >
        {/* Title / Icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: '1.4rem' }}>🗓️</span>
          <div>
            <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
              סינון לפי חודש חיוב
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
              הנתונים בדשבורד מבוססים על חודשי החיוב בבנק ובכרטיסי האשראי
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setPreset('current')}
            disabled={loading}
            style={{ fontSize: 'var(--font-size-xs)' }}
          >
            📌 חודש חיוב נוכחי
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setPreset('last')}
            disabled={loading}
            style={{ fontSize: 'var(--font-size-xs)' }}
          >
            ⏮️ חודש קודם
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setPreset('all')}
            disabled={loading}
            style={{ fontSize: 'var(--font-size-xs)' }}
          >
            🌐 כל הזמנים
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
          borderTop: '1px solid var(--color-border)',
          paddingTop: 'var(--space-3)',
        }}
      >
        {/* Mode Tabs */}
        <div
          style={{
            display: 'inline-flex',
            backgroundColor: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-md)',
            padding: '3px',
            gap: '2px',
          }}
        >
          <button
            type="button"
            onClick={() => handleModeChange('month')}
            className={`btn btn-sm ${filter.mode === 'month' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 'var(--radius-sm)', padding: '4px 12px' }}
          >
            חודש יחיד
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('range')}
            className={`btn btn-sm ${filter.mode === 'range' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 'var(--radius-sm)', padding: '4px 12px' }}
          >
            טווח חודשים
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('year')}
            className={`btn btn-sm ${filter.mode === 'year' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 'var(--radius-sm)', padding: '4px 12px' }}
          >
            שנה
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('all')}
            className={`btn btn-sm ${filter.mode === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 'var(--radius-sm)', padding: '4px 12px' }}
          >
            הכל
          </button>
        </div>

        {/* Dynamic Controls per Mode */}
        {filter.mode === 'month' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>חודש חיוב:</label>
            {availableMonths.length > 0 ? (
              <select
                className="input"
                value={filter.month}
                onChange={e => onChange({ ...filter, month: e.target.value })}
                style={{ padding: '6px 12px', minWidth: '160px' }}
              >
                {availableMonths.map(m => (
                  <option key={m} value={m}>
                    {formatMonthHebrew(m)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="month"
                className="input"
                value={filter.month}
                onChange={e => onChange({ ...filter, month: e.target.value })}
                style={{ padding: '6px 12px' }}
              />
            )}
          </div>
        )}

        {filter.mode === 'range' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>מחודש:</label>
              <select
                className="input"
                value={filter.fromMonth}
                onChange={e => onChange({ ...filter, fromMonth: e.target.value })}
                style={{ padding: '6px 12px', minWidth: '150px' }}
              >
                <option value="">בחר חודש התחלה</option>
                {availableMonths.map(m => (
                  <option key={m} value={m}>
                    {formatMonthHebrew(m)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>עד חודש:</label>
              <select
                className="input"
                value={filter.toMonth}
                onChange={e => onChange({ ...filter, toMonth: e.target.value })}
                style={{ padding: '6px 12px', minWidth: '150px' }}
              >
                <option value="">בחר חודש סיום</option>
                {availableMonths.map(m => (
                  <option key={m} value={m}>
                    {formatMonthHebrew(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {filter.mode === 'year' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>שנה:</label>
            <select
              className="input"
              value={filter.year}
              onChange={e => onChange({ ...filter, year: e.target.value })}
              style={{ padding: '6px 12px', minWidth: '120px' }}
            >
              {availableYears.length > 0 ? (
                availableYears.map(y => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))
              ) : (
                <option value={new Date().getFullYear().toString()}>
                  {new Date().getFullYear()}
                </option>
              )}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
