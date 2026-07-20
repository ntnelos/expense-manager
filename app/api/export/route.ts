import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import * as XLSX from 'xlsx';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const chargeMonth = searchParams.get('chargeMonth');
    const status = searchParams.get('status') || 'approved,approved_no_invoice'; // Default to approved unless "all"

    const statuses = status !== 'all' ? status.split(',') : [];

    const supabase = createServerClient();

    let query = supabase
      .from('expense_lines')
      .select('*, matches(*, invoice:invoices(*))')
      .order('transaction_date', { ascending: false });

    if (statuses.length > 0) {
      query = query.in('status', statuses);
    }

    if (chargeMonth) {
      // chargeMonth is YYYY-MM
      const startDateQuery = `${chargeMonth}-01`;
      const endYear = parseInt(chargeMonth.split('-')[0]);
      const endMonth = parseInt(chargeMonth.split('-')[1]);
      const nextMonth = endMonth === 12 ? 1 : endMonth + 1;
      const nextYear = endMonth === 12 ? endYear + 1 : endYear;
      const endDateQuery = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`;
      
      // we check if charge_date is within the month. 
      // If charge_date is null, we fallback to transaction_date.
      query = query.or(`and(charge_date.gte.${startDateQuery},charge_date.lt.${endDateQuery}),and(charge_date.is.null,transaction_date.gte.${startDateQuery},transaction_date.lt.${endDateQuery})`);
    } else {
      if (startDate) {
        query = query.gte('transaction_date', startDate);
      }
      if (endDate) {
        query = query.lte('transaction_date', endDate);
      }
    }

    const { data, error } = await query;

    if (error) throw error;

    // Build Excel Rows
    const excelRows: any[] = [];

    for (const line of data || []) {
      const rawMatches = line.matches;
      const matches = Array.isArray(rawMatches) ? rawMatches : rawMatches ? [rawMatches] : [];
      
      // If no matches, or just one match, or approved without invoice
      if (matches.length === 0) {
        excelRows.push({
          'תאריך עסקה (הוצאה)': line.transaction_date || '',
          'תאריך חיוב (הוצאה)': line.charge_date || '',
          'סכום חיוב (הוצאה)': line.amount || '',
          'סכום עסקה (הוצאה)': line.total_amount || line.amount || '',
          'פירוט בנק (הוצאה)': line.description || '',
          'הערה / סיבת אישור': line.approval_note || '',
          'שם ספק (חשבונית)': '',
          'ח.פ/עוסק (חשבונית)': '',
          'מספר חשבונית': '',
          'תאריך חשבונית': '',
          'סכום חשבונית': '',
          'מטבע חשבונית': '',
          'מע״מ (חשבונית)': '',
          'קישור לחשבונית': '',
        });
      } else {
        // Iterate through all matches for this expense line
        matches.forEach((match: any, index: number) => {
          const invoice = match.invoice;
          const isDuplicate = index > 0;
          
          excelRows.push({
            'תאריך עסקה (הוצאה)': line.transaction_date || '',
            'תאריך חיוב (הוצאה)': line.charge_date || '',
            'סכום חיוב (הוצאה)': isDuplicate ? `${line.amount} (העתק)` : line.amount,
            'סכום עסקה (הוצאה)': line.total_amount || line.amount || '',
            'פירוט בנק (הוצאה)': isDuplicate ? `${line.description} (העתק)` : line.description,
            'הערה / סיבת אישור': line.approval_note || '',
            'שם ספק (חשבונית)': invoice?.supplier_name || '',
            'ח.פ/עוסק (חשבונית)': invoice?.supplier_tax_id || '',
            'מספר חשבונית': invoice?.invoice_number || '',
            'תאריך חשבונית': invoice?.invoice_date || '',
            'סכום חשבונית': invoice?.total_amount || '',
            'מטבע חשבונית': invoice?.currency || '',
            'מע״מ (חשבונית)': invoice?.vat_amount || '',
            'קישור לחשבונית': invoice?.drive_file_url || '',
          });
        });
      }
    }

    // Create a new workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Expenses");

    // Generate buffer
    const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="expense_export_${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    });
  } catch (err: any) {
    console.error('Export error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
