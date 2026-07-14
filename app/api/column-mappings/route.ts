import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('column_mappings')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ mappings: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mapping_name, header_pattern, column_map } = body;

    if (!mapping_name || !column_map) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('column_mappings')
      .insert({
        mapping_name,
        header_pattern,
        column_map,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Mapping name already exists' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, mapping: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, mapping_name, header_pattern, column_map } = body;

    if (!id || !mapping_name || !column_map) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('column_mappings')
      .update({
        mapping_name,
        header_pattern,
        column_map,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Mapping name already exists' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, mapping: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const supabase = createServerClient();
    const { error } = await supabase
      .from('column_mappings')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
