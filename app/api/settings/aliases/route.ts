import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('supplier_aliases')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { original_name, alias_name } = json;

    if (!original_name || !alias_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServerClient();
    
    // Check if alias already exists for this original name
    const { data: existing } = await supabase
      .from('supplier_aliases')
      .select('id')
      .ilike('original_name', original_name)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Alias already exists for this original name' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('supplier_aliases')
      .insert({
        original_name,
        alias_name,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing alias id' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { error } = await supabase
      .from('supplier_aliases')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
