import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerClient();
    
    // We want to get distinct charge_dates from expense_lines.
    // In PostgREST (Supabase), we can use a raw SQL function or a view,
    // but since we don't have a distinct view right now, we can just select all charge_dates 
    // and distinct them in memory (since the number of distinct dates isn't huge),
    // OR we can use the `.select('charge_date')` and filter in memory.
    
    const { data, error } = await supabase
      .from('expense_lines')
      .select('charge_date')
      .not('charge_date', 'is', null)
      .order('charge_date', { ascending: false });

    if (error) throw error;

    // Extract unique dates using Set
    const distinctDates = Array.from(new Set(data.map(row => row.charge_date)));

    return NextResponse.json({ chargeDates: distinctDates });
  } catch (err: any) {
    console.error('GET charge-dates error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
