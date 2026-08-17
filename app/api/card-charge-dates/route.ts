import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('card_charge_dates')
      .select('*')
      .order('card_last_digits', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ cardChargeDates: data || [] });
  } catch (err: any) {
    console.error('GET card-charge-dates error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { card_last_digits, charge_day } = body;

    if (!card_last_digits || charge_day === undefined) {
      return NextResponse.json({ error: 'card_last_digits and charge_day are required' }, { status: 400 });
    }

    if (charge_day < 1 || charge_day > 31) {
      return NextResponse.json({ error: 'charge_day must be between 1 and 31' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('card_charge_dates')
      .upsert(
        { card_last_digits, charge_day },
        { onConflict: 'card_last_digits' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, cardChargeDate: data });
  } catch (err: any) {
    console.error('POST card-charge-dates error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
