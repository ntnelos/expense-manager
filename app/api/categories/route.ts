import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

// GET: List all categories ordered by sort_order
export async function GET() {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Supabase query error in categories list:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ categories: data || [] });
  } catch (error: any) {
    console.error('GET categories error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Create a new category
export async function POST(request: Request) {
  try {
    const { name, icon, color } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Get next sort_order
    const { data: maxRow } = await supabase
      .from('categories')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (maxRow?.sort_order || 0) + 1;

    const { data, error } = await supabase
      .from('categories')
      .insert({
        name: name.trim(),
        icon: icon || '📁',
        color: color || '#6366f1',
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'קטגוריה בשם זה כבר קיימת.' }, { status: 409 });
      }
      console.error('Supabase insert error in categories POST:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, category: data });
  } catch (error: any) {
    console.error('POST categories error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Delete a category by ID
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing category ID' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase delete error in categories DELETE:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Category deleted successfully' });
  } catch (error: any) {
    console.error('DELETE categories error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
