import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('ignored_expense_rules')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return NextResponse.json({ rules: data || [] });
  } catch (err: any) {
    console.error('GET ignored-expenses error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { description } = body;

    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    const supabase = createServerClient();
    
    const { data, error } = await supabase
      .from('ignored_expense_rules')
      .insert({ description_pattern: description })
      .select()
      .single();

    if (error) {
      // If it's a unique constraint violation, just return success (already ignored)
      if (error.code === '23505') {
        return NextResponse.json({ success: true, message: 'Already ignored' });
      }
      throw error;
    }

    return NextResponse.json({ success: true, rule: data });
  } catch (err: any) {
    console.error('POST ignored-expenses error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { error } = await supabase
      .from('ignored_expense_rules')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE ignored-expenses error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
