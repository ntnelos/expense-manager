import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { AdvancedDashboardStats, CategoryStat, ChargeDateStat } from '@/lib/supabase/types';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const supabase = createServerClient();

    // 1. Fetch available billing months from expense_lines (charge_date) and invoices (invoice_date)
    const [expDatesRes, invDatesRes] = await Promise.all([
      supabase
        .from('expense_lines')
        .select('charge_date, transaction_date')
        .not('charge_date', 'is', null),
      supabase
        .from('invoices')
        .select('invoice_date')
        .not('invoice_date', 'is', null)
    ]);

    const monthsSet = new Set<string>();
    (expDatesRes.data || []).forEach(row => {
      if (row.charge_date) monthsSet.add(row.charge_date.substring(0, 7));
    });
    (invDatesRes.data || []).forEach(row => {
      if (row.invoice_date) monthsSet.add(row.invoice_date.substring(0, 7));
    });

    const availableMonths = Array.from(monthsSet).sort().reverse();
    const defaultMonth = availableMonths[0] || new Date().toISOString().substring(0, 7);

    // Filter Parameters
    let mode = (searchParams.get('mode') || 'month') as 'month' | 'range' | 'year' | 'all';
    const monthParam = searchParams.get('month') || defaultMonth;
    const fromMonthParam = searchParams.get('fromMonth') || '';
    const toMonthParam = searchParams.get('toMonth') || '';
    const yearParam = searchParams.get('year') || monthParam.substring(0, 4);

    // Calculate Date Boundaries
    let startDate: string | null = null;
    let endDate: string | null = null;
    let periodLabel = 'כל הזמנים';

    if (mode === 'month' && monthParam) {
      startDate = `${monthParam}-01`;
      const [y, m] = monthParam.split('-').map(Number);
      const nextM = m === 12 ? 1 : m + 1;
      const nextY = m === 12 ? y + 1 : y;
      endDate = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
      periodLabel = `חודש חיוב ${monthParam}`;
    } else if (mode === 'range' && fromMonthParam && toMonthParam) {
      startDate = `${fromMonthParam}-01`;
      const [y, m] = toMonthParam.split('-').map(Number);
      const nextM = m === 12 ? 1 : m + 1;
      const nextY = m === 12 ? y + 1 : y;
      endDate = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
      periodLabel = `מחודש ${fromMonthParam} עד ${toMonthParam}`;
    } else if (mode === 'year' && yearParam) {
      startDate = `${yearParam}-01-01`;
      endDate = `${Number(yearParam) + 1}-01-01`;
      periodLabel = `שנת ${yearParam}`;
    } else {
      mode = 'all';
      periodLabel = 'כל הזמנים';
    }

    // 2. Fetch Expense Lines for period
    let expQuery = supabase
      .from('expense_lines')
      .select('*, matches(invoice_id)');

    if (startDate && endDate) {
      expQuery = expQuery.or(
        `and(charge_date.gte.${startDate},charge_date.lt.${endDate}),and(charge_date.is.null,transaction_date.gte.${startDate},transaction_date.lt.${endDate})`
      );
    }

    const { data: expenseLines, error: expErr } = await expQuery;
    if (expErr) throw expErr;

    const linesList = expenseLines || [];
    const totalExpenseLines = linesList.length;
    const matchedExpenseLines = linesList.filter(
      l => l.status === 'approved' || l.status === 'approved_no_invoice' || (Array.isArray(l.matches) ? l.matches.length > 0 : !!l.matches)
    ).length;
    const unapprovedExpenseLines = linesList.filter(l => l.status === 'unapproved').length;
    const totalExpenseAmount = linesList.reduce((sum, l) => sum + (Number(l.total_amount || l.amount) || 0), 0);
    const expenseMatchRate = totalExpenseLines > 0 ? (matchedExpenseLines / totalExpenseLines) * 100 : 0;

    // Metric D: Charge Dates Breakdown
    const chargeDatesMap: Record<string, ChargeDateStat> = {};
    linesList.forEach(l => {
      const cDate = l.charge_date || l.transaction_date || 'ללא תאריך';
      if (!chargeDatesMap[cDate]) {
        chargeDatesMap[cDate] = {
          charge_date: cDate,
          total_amount: 0,
          total_lines: 0,
          matched_lines: 0,
        };
      }
      const amt = Number(l.total_amount || l.amount || 0);
      chargeDatesMap[cDate].total_amount += amt;
      chargeDatesMap[cDate].total_lines += 1;
      if (l.status === 'approved' || l.status === 'approved_no_invoice' || (Array.isArray(l.matches) ? l.matches.length > 0 : !!l.matches)) {
        chargeDatesMap[cDate].matched_lines += 1;
      }
    });

    const chargeDatesData: ChargeDateStat[] = Object.values(chargeDatesMap).sort((a, b) =>
      a.charge_date.localeCompare(b.charge_date)
    );

    // 3. Fetch Invoices for period
    const matchedInvoiceIds = new Set<string>();
    linesList.forEach(l => {
      if (l.matches) {
        const matchesArr = Array.isArray(l.matches) ? l.matches : [l.matches];
        matchesArr.forEach((m: any) => {
          if (m.invoice_id) matchedInvoiceIds.add(m.invoice_id);
        });
      }
    });

    let invQuery = supabase
      .from('invoices')
      .select('*, categories(id, name, color, icon)');

    if (startDate && endDate) {
      if (matchedInvoiceIds.size > 0) {
        invQuery = invQuery.or(
          `id.in.(${Array.from(matchedInvoiceIds).join(',')}),and(invoice_date.gte.${startDate},invoice_date.lt.${endDate})`
        );
      } else {
        invQuery = invQuery.gte('invoice_date', startDate).lt('invoice_date', endDate);
      }
    }

    const { data: invoices, error: invErr } = await invQuery;
    if (invErr) throw invErr;

    const invoicesList = invoices || [];
    const totalInvoices = invoicesList.length;
    const matchedInvoices = invoicesList.filter(
      i => i.status === 'fully_matched' || i.status === 'partially_matched'
    ).length;
    const approvedNoExpenseInvoices = invoicesList.filter(
      i => i.status === 'approved_no_expense'
    ).length;
    const pendingInvoices = invoicesList.filter(
      i => i.status === 'new' || i.status === 'processing'
    ).length;
    const sentToAccountantCount = invoicesList.filter(
      i => i.sent_to_accountant === true
    ).length;
    const notSentToAccountantCount = totalInvoices - sentToAccountantCount;

    // Metric C: Category breakdown for invoices
    const catMap: Record<string, {
      name: string;
      value: number;
      count: number;
      invoices: Array<{
        id: string;
        supplier_name: string | null;
        invoice_number: string | null;
        invoice_date: string | null;
        total_amount: number | null;
        status: string;
      }>;
    }> = {};
    let totalCategorySum = 0;

    invoicesList.forEach(i => {
      const catName = i.categories?.name || (i.raw_ocr_data as any)?.suggested_category || 'ללא קטגוריה';
      const amt = Number(i.total_amount || 0);
      if (!catMap[catName]) {
        catMap[catName] = { name: catName, value: 0, count: 0, invoices: [] };
      }
      catMap[catName].value += amt;
      catMap[catName].count += 1;
      catMap[catName].invoices.push({
        id: i.id,
        supplier_name: i.supplier_name,
        invoice_number: i.invoice_number,
        invoice_date: i.invoice_date,
        total_amount: i.total_amount,
        status: i.status,
      });
      totalCategorySum += amt;
    });

    const categoriesData: CategoryStat[] = Object.values(catMap)
      .map(c => ({
        ...c,
        percentage: totalCategorySum > 0 ? (c.value / totalCategorySum) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    const stats: AdvancedDashboardStats = {
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

      categoriesData,
      chargeDatesData,

      availableMonths,
      selectedPeriod: {
        mode,
        month: monthParam,
        fromMonth: fromMonthParam,
        toMonth: toMonthParam,
        year: yearParam,
        label: periodLabel,
      },
    };

    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
