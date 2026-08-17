import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = createServerClient();

    // Step 1: Create card_charge_dates table via raw SQL
    // Since we can't run DDL via PostgREST, we'll create a migration API
    // The table will be created via Supabase Dashboard SQL editor
    // For now, just seed the data and update existing records

    // Step 2: Insert default card charge dates
    const { error: upsertError } = await supabase
      .from('card_charge_dates')
      .upsert([
        { card_last_digits: '0493', charge_day: 15 },
        { card_last_digits: '6498', charge_day: 10 },
      ], { onConflict: 'card_last_digits' });

    if (upsertError) {
      return NextResponse.json({ 
        error: 'card_charge_dates table may not exist. Please create it via Supabase SQL editor.',
        details: upsertError.message,
        sql: `CREATE TABLE IF NOT EXISTS card_charge_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_last_digits TEXT UNIQUE NOT NULL,
  charge_day INTEGER NOT NULL CHECK (charge_day >= 1 AND charge_day <= 31),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE card_charge_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access" ON card_charge_dates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access" ON card_charge_dates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER tr_card_charge_dates_updated_at
  BEFORE UPDATE ON card_charge_dates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();`
      }, { status: 500 });
    }

    // Step 3: Update Aug 13 records
    const { data: d1, error: e1 } = await supabase
      .from('expense_lines')
      .update({ charge_date: '2026-08-15' })
      .is('charge_date', null)
      .eq('card_last_digits', '0493')
      .gte('created_at', '2026-08-13T00:00:00')
      .lt('created_at', '2026-08-14T00:00:00')
      .select('id');

    const { data: d2, error: e2 } = await supabase
      .from('expense_lines')
      .update({ charge_date: '2026-08-10' })
      .is('charge_date', null)
      .eq('card_last_digits', '6498')
      .gte('created_at', '2026-08-13T00:00:00')
      .lt('created_at', '2026-08-14T00:00:00')
      .select('id');

    return NextResponse.json({
      success: true,
      cardChargeDates: 'Defaults inserted (0493→15, 6498→10)',
      updated0493: d1?.length || 0,
      updated6498: d2?.length || 0,
      errors: [e1?.message, e2?.message].filter(Boolean),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
