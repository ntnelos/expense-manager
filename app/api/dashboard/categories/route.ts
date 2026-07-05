import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerClient();
    
    // Group expense lines by original_category and sum their total_amount
    const { data, error } = await supabase
      .from('expense_lines')
      .select('original_category, total_amount, amount');

    if (error) throw error;

    const categoryMap: Record<string, number> = {};

    (data || []).forEach(line => {
      const category = line.original_category || 'ללא קטגוריה';
      const amount = Number(line.total_amount || line.amount || 0);
      categoryMap[category] = (categoryMap[category] || 0) + amount;
    });

    // Convert to array for Recharts
    const chartData = Object.entries(categoryMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value) // Sort descending
      .slice(0, 10); // Top 10 categories

    return NextResponse.json(chartData);
  } catch (err: any) {
    console.error('Failed to fetch categories:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
