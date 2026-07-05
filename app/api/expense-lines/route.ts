import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';
    const minAmount = searchParams.get('minAmount') || '';
    const maxAmount = searchParams.get('maxAmount') || '';

    const offset = (page - 1) * limit;
    const supabase = createServerClient();

    let query = supabase
      .from('expense_lines')
      .select('*, matches(*)', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(`description.ilike.%${search}%,original_category.ilike.%${search}%`);
    }

    if (dateFrom) {
      query = query.gte('transaction_date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('transaction_date', dateTo);
    }
    if (minAmount) {
      query = query.gte('amount', parseFloat(minAmount));
    }
    if (maxAmount) {
      query = query.lte('amount', parseFloat(maxAmount));
    }

    query = query.order('transaction_date', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    
    if (error) throw error;

    return NextResponse.json({
      expenseLines: data || [],
      count: count || 0,
      totalPages: count ? Math.ceil(count / limit) : 0,
    });
  } catch (err: any) {
    console.error('GET expense_lines error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, ids, status, approval_note } = body;

    const supabase = createServerClient();

    // Support both single id or array of ids (for bulk approve)
    const targetIds = ids || (id ? [id] : []);

    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (status !== undefined) updates.status = status;
    if (approval_note !== undefined) updates.approval_note = approval_note;

    const { data, error } = await supabase
      .from('expense_lines')
      .update(updates)
      .in('id', targetIds)
      .select();

    if (error) throw error;
    
    return NextResponse.json({ success: true, updated: data });
  } catch (err: any) {
    console.error('PATCH expense_lines error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const supabase = createServerClient();
    const { error } = await supabase
      .from('expense_lines')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE expense_lines error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
