import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerClient();

    const [invoicesRes, expenseLinesRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('expense_lines')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    return NextResponse.json({
      invoices: invoicesRes.data || [],
      expenseLines: expenseLinesRes.data || [],
    });
  } catch (error) {
    console.error('Recent activity error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recent activity' },
      { status: 500 }
    );
  }
}
