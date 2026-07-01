'use client';

import type { DashboardStats } from '@/lib/supabase/types';

interface SummaryCardsProps {
  stats: DashboardStats;
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
  if (loading) {
    return (
      <div className="summary-grid">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="summary-card">
            <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-4)' }} />
            <div className="skeleton" style={{ width: '60%', height: 14, marginBottom: 'var(--space-2)' }} />
            <div className="skeleton" style={{ width: '40%', height: 32, marginBottom: 'var(--space-2)' }} />
            <div className="skeleton" style={{ width: '50%', height: 12 }} />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      icon: '🧾',
      label: 'Total Invoices',
      value: stats.totalInvoices.toString(),
      change: `${stats.unmatchedInvoices} unmatched`,
      variant: 'accent' as const,
    },
    {
      icon: '🏦',
      label: 'Expense Lines',
      value: stats.totalExpenseLines.toString(),
      change: `${stats.unapprovedExpenseLines} unapproved`,
      variant: 'info' as const,
    },
    {
      icon: '🔗',
      label: 'Match Rate',
      value: `${stats.matchRate.toFixed(1)}%`,
      change: stats.matchRate >= 80 ? 'Great coverage' : 'Needs attention',
      variant: stats.matchRate >= 80 ? 'success' as const : 'warning' as const,
    },
    {
      icon: '⚠️',
      label: 'Unmatched Invoices',
      value: stats.unmatchedInvoices.toString(),
      change: stats.unmatchedInvoices === 0 ? 'All matched!' : 'Awaiting match',
      variant: stats.unmatchedInvoices === 0 ? 'success' as const : 'error' as const,
    },
    {
      icon: '💰',
      label: 'Total Matched',
      value: formatCurrency(stats.totalMatchedAmount),
      change: 'Verified expenses',
      variant: 'success' as const,
    },
  ];

  return (
    <div className="summary-grid">
      {cards.map((card, index) => (
        <div key={card.label} className={`summary-card ${card.variant} animate-in`} style={{ animationDelay: `${index * 60}ms` }}>
          <div className="summary-card-icon">{card.icon}</div>
          <div className="summary-card-label">{card.label}</div>
          <div className="summary-card-value">{card.value}</div>
          <div className="summary-card-change">{card.change}</div>
        </div>
      ))}
    </div>
  );
}
