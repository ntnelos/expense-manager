import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { DUPLICATE_INVOICE_FIELDS } from '@/lib/invoices/duplicates';

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
      .select(DUPLICATE_INVOICE_FIELDS)
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
        duplicate_type: 'identical_file',
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
