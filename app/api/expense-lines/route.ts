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
    const chargeDate = searchParams.get('chargeDate') || '';

    const offset = (page - 1) * limit;
    const supabase = createServerClient();

    let query = supabase
      .from('expense_lines')
      .select('*, matches(*)', { count: 'exact' });

    if (status) {
      if (status === 'matched') {
        query = query.in('status', ['approved', 'approved_no_invoice']);
      } else {
        query = query.eq('status', status);
      }
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
    if (chargeDate) {
      query = query.eq('charge_date', chargeDate);
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
    const { id, ids, status, approval_note, transaction_date, amount, total_amount, description, currency, card_last_digits } = body;

    const supabase = createServerClient();

    // Support both single id or array of ids (for bulk approve)
    const targetIds = ids || (id ? [id] : []);

    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (status !== undefined) updates.status = status;
    if (approval_note !== undefined) updates.approval_note = approval_note;
    if (transaction_date !== undefined) updates.transaction_date = transaction_date;
    if (amount !== undefined) updates.amount = amount;
    if (total_amount !== undefined) updates.total_amount = total_amount;
    if (description !== undefined) updates.description = description;
    if (currency !== undefined) updates.currency = currency;
    if (card_last_digits !== undefined) updates.card_last_digits = card_last_digits;

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { transaction_date, amount, total_amount, description, currency, card_last_digits } = body;

    if (!transaction_date || amount === undefined) {
      return NextResponse.json({ error: 'Transaction date and amount are required' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('expense_lines')
      .insert({
        transaction_date,
        amount,
        total_amount: total_amount || null,
        description: description || null,
        currency: currency || 'ILS',
        card_last_digits: card_last_digits || null,
        source_file: 'manual',
        status: 'unapproved',
      })
      .select()
      .single();

    if (error) throw error;
    
    return NextResponse.json({ success: true, inserted: data });
  } catch (err: any) {
    console.error('POST expense_lines error:', err);
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
