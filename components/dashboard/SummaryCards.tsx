'use client';

import React from 'react';
import type { AdvancedDashboardStats } from '@/lib/supabase/types';

interface SummaryCardsProps {
  stats: AdvancedDashboardStats | null;
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

export default function SummaryCards({ stats, loading }: SummaryCardsProps) {
  if (loading || !stats) {
    return (
      <div className="summary-grid" style={{ marginBottom: 'var(--space-6)' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="summary-card card">
            <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-4)' }} />
            <div className="skeleton" style={{ width: '60%', height: 14, marginBottom: 'var(--space-2)' }} />
            <div className="skeleton" style={{ width: '40%', height: 32, marginBottom: 'var(--space-2)' }} />
            <div className="skeleton" style={{ width: '50%', height: 12 }} />
          </div>
        ))}
      </div>
    );
  }

  const {
    totalExpenseLines,
    matchedExpenseLines,
    unapprovedExpenseLines,
    expenseMatchRate,
    totalExpenseAmount,

    totalInvoices,
    matchedInvoices,
    approvedNoExpenseInvoices,
    pendingInvoices,
    sentToAccountantCount,
    notSentToAccountantCount,
  } = stats;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-6)',
      }}
    >
      {/* CARD 1: METRIC A — Expense Lines Match Rate */}
      <div className="card animate-in" style={{ padding: 'var(--space-5)', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: '1.5rem', backgroundColor: 'var(--color-surface-hover)', padding: '8px', borderRadius: 'var(--radius-md)' }}>
              🏦
            </span>
            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'block', fontWeight: 600 }}>
                שורות הוצאה בבנק
              </span>
              <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
                התאמת שורות הוצאה
              </h4>
            </div>
          </div>
          <span
            className={`badge ${expenseMatchRate >= 90 ? 'badge-success' : expenseMatchRate >= 70 ? 'badge-warning' : 'badge-error'}`}
            style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700 }}
          >
            {expenseMatchRate.toFixed(1)}% הותאמו
          </span>
        </div>

        {/* Big Number */}
        <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>
          {matchedExpenseLines} <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>מתוך {totalExpenseLines} שורות</span>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            height: '8px',
            width: '100%',
            backgroundColor: 'var(--color-surface-hover)',
            borderRadius: '4px',
            overflow: 'hidden',
            marginBottom: 'var(--space-3)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, expenseMatchRate))}%`,
              backgroundColor: expenseMatchRate >= 90 ? 'var(--color-success)' : expenseMatchRate >= 70 ? 'var(--color-warning)' : 'var(--color-error)',
              transition: 'width 0.5s ease-in-out',
            }}
          />
        </div>

        {/* Sub Details */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
          <span>✅ אושרו/הותאמו: <strong style={{ color: 'var(--color-text)' }}>{matchedExpenseLines}</strong></span>
          <span>⏳ לא אושרו: <strong style={{ color: unapprovedExpenseLines > 0 ? 'var(--color-warning)' : 'var(--color-text)' }}>{unapprovedExpenseLines}</strong></span>
        </div>
      </div>

      {/* CARD 2: METRIC B — Invoices Breakdown */}
      <div className="card animate-in" style={{ padding: 'var(--space-5)', animationDelay: '100ms' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: '1.5rem', backgroundColor: 'var(--color-surface-hover)', padding: '8px', borderRadius: 'var(--radius-md)' }}>
              🧾
            </span>
            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'block', fontWeight: 600 }}>
                חשבוניות בתקופה
              </span>
              <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
                סטטוס התאמת חשבוניות
              </h4>
            </div>
          </div>
          <span className="badge badge-accent" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700 }}>
            {totalInvoices} סה״כ
          </span>
        </div>

        {/* Big Number */}
        <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, marginBottom: 'var(--space-3)' }}>
          {totalInvoices} <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>חשבוניות נקלטו</span>
        </div>

        {/* Breakdown Badges */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
          <div style={{ backgroundColor: 'var(--color-surface-hover)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '10px' }}>🔗 הותאמו</div>
            <strong style={{ fontSize: '14px', color: 'var(--color-success)' }}>{matchedInvoices}</strong>
          </div>
          <div style={{ backgroundColor: 'var(--color-surface-hover)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '10px' }}>📄 ללא הוצאה</div>
            <strong style={{ fontSize: '14px', color: 'var(--color-primary)' }}>{approvedNoExpenseInvoices}</strong>
          </div>
          <div style={{ backgroundColor: 'var(--color-surface-hover)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '10px' }}>⏳ ממתינות</div>
            <strong style={{ fontSize: '14px', color: pendingInvoices > 0 ? 'var(--color-warning)' : 'var(--color-text)' }}>{pendingInvoices}</strong>
          </div>
        </div>
      </div>

      {/* CARD 3: METRIC B — Sent to Accountant */}
      <div className="card animate-in" style={{ padding: 'var(--space-5)', animationDelay: '200ms' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: '1.5rem', backgroundColor: 'var(--color-surface-hover)', padding: '8px', borderRadius: 'var(--radius-md)' }}>
              📨
            </span>
            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'block', fontWeight: 600 }}>
                דיווח וייצוא
              </span>
              <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
                שליחה לרואה חשבון
              </h4>
            </div>
          </div>
          <span
            className={`badge ${notSentToAccountantCount === 0 ? 'badge-success' : 'badge-warning'}`}
            style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700 }}
          >
            {notSentToAccountantCount === 0 ? 'הכל נשלח' : `${notSentToAccountantCount} ממתינות`}
          </span>
        </div>

        {/* Big Number */}
        <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, marginBottom: 'var(--space-3)' }}>
          {sentToAccountantCount} <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>מתוך {totalInvoices} נשלחו</span>
        </div>

        {/* Sub Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
          <div style={{ backgroundColor: 'var(--color-surface-hover)', padding: '8px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>✅ נשלחו לרו״ח:</span>
            <strong style={{ color: 'var(--color-success)', fontSize: '14px' }}>{sentToAccountantCount}</strong>
          </div>
          <div style={{ backgroundColor: 'var(--color-surface-hover)', padding: '8px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>⏳ טרם נשלחו:</span>
            <strong style={{ color: notSentToAccountantCount > 0 ? 'var(--color-warning)' : 'var(--color-text)', fontSize: '14px' }}>{notSentToAccountantCount}</strong>
          </div>
        </div>
      </div>

      {/* CARD 4: TOTAL EXPENSE AMOUNT */}
      <div className="card animate-in" style={{ padding: 'var(--space-5)', animationDelay: '300ms' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: '1.5rem', backgroundColor: 'var(--color-surface-hover)', padding: '8px', borderRadius: 'var(--radius-md)' }}>
              💰
            </span>
            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'block', fontWeight: 600 }}>
                סיכום כספי
              </span>
              <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
                סך הוצאות בתקופה
              </h4>
            </div>
          </div>
        </div>

        {/* Big Number */}
        <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--color-primary)', marginBottom: 'var(--space-3)' }}>
          {formatCurrency(totalExpenseAmount)}
        </div>

        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
          סך כל החיוביים והעסקאות שבוצעו בתקופת החיוב הנבחרת
        </div>
      </div>
    </div>
  );
}
