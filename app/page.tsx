'use client';

import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import DashboardFilterBar, { type DashboardFilterState } from '@/components/dashboard/DashboardFilterBar';
import SummaryCards from '@/components/dashboard/SummaryCards';
import ChargeDatesChart from '@/components/dashboard/ChargeDatesChart';
import CategoryChart from '@/components/dashboard/CategoryChart';
import RecentActivity from '@/components/dashboard/RecentActivity';
import type { AdvancedDashboardStats, Invoice, ExpenseLine } from '@/lib/supabase/types';
import Link from 'next/link';

export default function DashboardPage() {
  const [filter, setFilter] = useState<DashboardFilterState>({
    mode: 'month',
    month: '',
    fromMonth: '',
    toMonth: '',
    year: '',
  });

  const [stats, setStats] = useState<AdvancedDashboardStats | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [recentExpenseLines, setRecentExpenseLines] = useState<ExpenseLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const fetchDashboardStats = useCallback(async (currentFilter: DashboardFilterState) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('mode', currentFilter.mode);
      if (currentFilter.month) params.set('month', currentFilter.month);
      if (currentFilter.fromMonth) params.set('fromMonth', currentFilter.fromMonth);
      if (currentFilter.toMonth) params.set('toMonth', currentFilter.toMonth);
      if (currentFilter.year) params.set('year', currentFilter.year);

      const res = await fetch(`/api/dashboard/stats?${params.toString()}`);
      if (res.ok) {
        const data: AdvancedDashboardStats = await res.json();
        setStats(data);

        // Set default month in filter if not already set
        if (!initialLoaded && data.selectedPeriod?.month && !currentFilter.month) {
          setFilter(prev => ({ ...prev, month: data.selectedPeriod.month || '' }));
          setInitialLoaded(true);
        }
      }
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  }, [initialLoaded]);

  useEffect(() => {
    fetchDashboardStats(filter);
  }, [filter, fetchDashboardStats]);

  useEffect(() => {
    async function fetchRecent() {
      try {
        const recentRes = await fetch('/api/dashboard/recent');
        if (recentRes.ok) {
          const recentData = await recentRes.json();
          setRecentInvoices(recentData.invoices || []);
          setRecentExpenseLines(recentData.expenseLines || []);
        }
      } catch (error) {
        console.error('Failed to fetch recent activity:', error);
      }
    }
    fetchRecent();
  }, []);

  return (
    <>
      <PageHeader title="לוח בקרה">
        <Link href="/matching" className="btn btn-primary">
          🏟️ זירת ההתאמות
        </Link>
        <Link href="/invoices/upload" className="btn btn-secondary">
          📤 העלאת חשבונית
        </Link>
        <Link href="/import" className="btn btn-secondary">
          📥 ייבוא נתוני בנק
        </Link>
      </PageHeader>

      <div className="page-content">
        {/* Filter Toolbar */}
        <DashboardFilterBar
          filter={filter}
          availableMonths={stats?.availableMonths || []}
          onChange={setFilter}
          loading={loading}
        />

        {/* Selected Period Label Banner */}
        {stats?.selectedPeriod?.label && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--color-surface-hover)',
              borderRight: '4px solid var(--color-primary)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3) var(--space-4)',
              marginBottom: 'var(--space-6)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            <span>
              📍 מציג נתונים עבור: <strong>{stats.selectedPeriod.label}</strong>
            </span>
            {stats.totalExpenseAmount > 0 && (
              <span>
                סה״כ הוצאות בבנק: <strong>₪{stats.totalExpenseAmount.toLocaleString()}</strong>
              </span>
            )}
          </div>
        )}

        {/* Summary Cards: Metric A & Metric B */}
        <SummaryCards stats={stats} loading={loading} />

        {/* Metric D: Total Expense per Bank Charge Date */}
        <ChargeDatesChart data={stats?.chargeDatesData || []} loading={loading} />

        {/* Metric C: Expense by Invoice Category */}
        <CategoryChart data={stats?.categoriesData || []} loading={loading} />

        {/* Quick Actions */}
        <div className="card animate-in" style={{ marginBottom: 'var(--space-8)' }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            <div>
              <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                פעולות מהירות
              </h3>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                גש למשימות נפוצות במהירות
              </p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Link href="/matching" className="btn btn-primary btn-lg">
                🏟️ פתח את זירת ההתאמות
              </Link>
              <Link href="/invoices" className="btn btn-secondary btn-lg">
                🧾 צפה בכל החשבוניות
              </Link>
              <Link href="/expense-lines" className="btn btn-secondary btn-lg">
                🏦 צפה בשורות ההוצאה
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
          פעילות אחרונה
        </h2>
        <RecentActivity
          invoices={recentInvoices}
          expenseLines={recentExpenseLines}
          loading={loading}
        />
      </div>
    </>
  );
}
