import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status') || 'approved,approved_no_invoice'; // Default to approved

    const statuses = status.split(',');

    const supabase = createServerClient();

    let query = supabase
      .from('expense_lines')
      .select('*, matches(*, invoices(*))')
      .in('status', statuses)
      .order('transaction_date', { ascending: false });

    if (startDate) {
      query = query.gte('transaction_date', startDate);
    }
    if (endDate) {
      query = query.lte('transaction_date', endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Build CSV
    const headers = [
      'תאריך עסקה',
      'תאריך חיוב',
      'סכום חיוב',
      'סכום עסקה',
      'פירוט בנק',
      'קטגוריה מקורית',
      'שם ספק (מחשבונית)',
      'ח.פ/עוסק (מחשבונית)',
      'קישור לחשבונית',
    ];

    const escapeCSV = (str: any) => {
      if (str == null) return '';
      const stringified = String(str);
      // Double up any quotes and wrap in quotes if there are commas or quotes
      if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
        return `"${stringified.replace(/"/g, '""')}"`;
      }
      return stringified;
    };

    const csvRows = [headers.join(',')];

    for (const line of data || []) {
      // Find the best match if there are multiple (usually there's only one)
      const match = line.matches?.[0];
      const invoice = match?.invoices;

      const row = [
        line.transaction_date,
        line.charge_date || '',
        line.amount,
        line.total_amount || line.amount,
        line.description || '',
        line.original_category || '',
        invoice?.supplier_name || '',
        invoice?.supplier_tax_id || '',
        invoice?.drive_file_url || '',
      ];

      csvRows.push(row.map(escapeCSV).join(','));
    }

    // Add BOM for Excel Hebrew support
    const csvContent = '\uFEFF' + csvRows.join('\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="expense_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (err: any) {
    console.error('Export error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
