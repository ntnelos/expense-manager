import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const { hash } = await request.json();

    if (!hash) {
      return NextResponse.json(
        { error: 'Missing content hash parameter' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Check if the hash exists in the database
    const { data, error } = await supabase
      .from('invoices')
      .select('id, supplier_name, total_amount, invoice_date, drive_file_url')
      .eq('content_hash', hash)
      .maybeSingle();

    if (error) {
      console.error('Database query error checking duplicate:', error);
      return NextResponse.json(
        { error: 'Failed to verify file status' },
        { status: 500 }
      );
    }

    if (data) {
      return NextResponse.json({
        exists: true,
        invoice: data,
      });
    }

    return NextResponse.json({ exists: false });
  } catch (error) {
    console.error('Duplicate checking error:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
