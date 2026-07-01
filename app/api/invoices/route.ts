import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { deleteFromGoogleDrive } from '@/lib/google/drive';

// 1. GET: Fetch invoices with robust filtering, search, and sorting
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
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
      .from('invoices')
      .select('*', { count: 'exact' });

    // Apply Filters
    if (status) {
      query = query.eq('status', status);
    }
    
    if (search) {
      query = query.or(`supplier_name.ilike.%${search}%,original_filename.ilike.%${search}%,supplier_tax_id.ilike.%${search}%`);
    }

    if (dateFrom) {
      query = query.gte('invoice_date', dateFrom);
    }

    if (dateTo) {
      query = query.lte('invoice_date', dateTo);
    }

    if (minAmount) {
      query = query.gte('total_amount', parseFloat(minAmount));
    }

    if (maxAmount) {
      query = query.lte('total_amount', parseFloat(maxAmount));
    }

    // Sort by newest created first
    query = query.order('created_at', { ascending: false });

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error('Supabase query error in invoices list:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      invoices: data || [],
      count: count || 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0,
    });
  } catch (error: any) {
    console.error('GET invoices error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 2. PATCH: Update invoice fields (e.g. user corrections or verification)
export async function PATCH(request: Request) {
  try {
    const { id, ...updates } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Missing invoice ID' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Prevent updating protected fields directly through patch
    const allowedUpdates: Record<string, any> = {};
    const allowedKeys = [
      'supplier_name',
      'supplier_tax_id',
      'invoice_date',
      'total_amount',
      'vat_amount',
      'document_type',
      'status',
      'ocr_verified',
    ];

    for (const key of allowedKeys) {
      if (updates[key] !== undefined) {
        allowedUpdates[key] = updates[key];
      }
    }

    // If verified is updated to true, we can also set status to handled if it's fully matched,
    // or keep it as is. Let's just update the requested fields.
    const { data, error } = await supabase
      .from('invoices')
      .update(allowedUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase update error in invoice PATCH:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, invoice: data });
  } catch (error: any) {
    console.error('PATCH invoice error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 3. DELETE: Delete invoice and remove its Google Drive file
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing invoice ID' }, { status: 400 });
    }

    const supabase = createServerClient();

    // 1. Get Google Drive ID
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('drive_file_id')
      .eq('id', id)
      .single();

    if (fetchError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // 2. Delete from DB (foreign keys with CASCADE will delete matches)
    const { error: deleteError } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Supabase delete error in invoice DELETE:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // 3. Delete from Google Drive
    try {
      if (invoice.drive_file_id) {
        await deleteFromGoogleDrive(invoice.drive_file_id);
      }
    } catch (driveErr) {
      console.warn('Failed to delete associated Google Drive file. File may already be removed.', driveErr);
    }

    return NextResponse.json({ success: true, message: 'Invoice deleted successfully' });
  } catch (error: any) {
    console.error('DELETE invoice error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
