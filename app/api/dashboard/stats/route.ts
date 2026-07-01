import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { DashboardStats } from '@/lib/supabase/types';

export async function GET() {
  try {
    const supabase = createServerClient();

    // Run all queries in parallel
    const [
      invoicesCountRes,
      unmatchedInvoicesRes,
      expenseLinesCountRes,
      unapprovedLinesRes,
      matchedAmountRes,
    ] = await Promise.all([
      // Total invoices
      supabase.from('invoices').select('*', { count: 'exact', head: true }),
      // Unmatched invoices (new or partially_matched)
      supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .in('status', ['new', 'partially_matched']),
      // Total expense lines
      supabase.from('expense_lines').select('*', { count: 'exact', head: true }),
      // Unapproved expense lines
      supabase
        .from('expense_lines')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'unapproved'),
      // Total matched amount
      supabase.from('invoices').select('matched_amount'),
    ]);

    const totalInvoices = invoicesCountRes.count || 0;
    const unmatchedInvoices = unmatchedInvoicesRes.count || 0;
    const totalExpenseLines = expenseLinesCountRes.count || 0;
    const unapprovedExpenseLines = unapprovedLinesRes.count || 0;

    const totalMatchedAmount = (matchedAmountRes.data || []).reduce(
      (sum, row) => sum + (Number(row.matched_amount) || 0),
      0
    );

    const matchRate =
      totalInvoices > 0
        ? ((totalInvoices - unmatchedInvoices) / totalInvoices) * 100
        : 0;

    const stats: DashboardStats = {
      totalInvoices,
      unmatchedInvoices,
      totalExpenseLines,
      unapprovedExpenseLines,
      matchRate,
      totalMatchedAmount,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
