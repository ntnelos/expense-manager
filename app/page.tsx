'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import SummaryCards from '@/components/dashboard/SummaryCards';
import RecentActivity from '@/components/dashboard/RecentActivity';
import CategoryChart from '@/components/dashboard/CategoryChart';
import type { DashboardStats, Invoice, ExpenseLine } from '@/lib/supabase/types';
import Link from 'next/link';

const EMPTY_STATS: DashboardStats = {
  totalInvoices: 0,
  unmatchedInvoices: 0,
  totalExpenseLines: 0,
  unapprovedExpenseLines: 0,
  matchRate: 0,
  totalMatchedAmount: 0,
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [recentExpenseLines, setRecentExpenseLines] = useState<ExpenseLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, recentRes] = await Promise.all([
          fetch('/api/dashboard/stats'),
          fetch('/api/dashboard/recent'),
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }

        if (recentRes.ok) {
          const recentData = await recentRes.json();
          setRecentInvoices(recentData.invoices || []);
          setRecentExpenseLines(recentData.expenseLines || []);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return (
    <>
      <PageHeader title="לוח בקרה">
        <Link href="/invoices/upload" className="btn btn-primary">
          📤 העלאת חשבונית
        </Link>
        <Link href="/import" className="btn btn-secondary">
          📥 ייבוא נתוני בנק
        </Link>
      </PageHeader>

      <div className="page-content">
        {/* Summary Cards */}
        <SummaryCards stats={stats} loading={loading} />

        {/* Category Chart */}
        <CategoryChart />

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
