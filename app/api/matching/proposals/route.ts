import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getMatchProposals } from '@/lib/matching/auto';

export const dynamic = 'force-dynamic';

// Auto-match proposals over all open invoices and card lines (every month, not just the one on screen).
export async function GET() {
  try {
    const supabase = createServerClient();
    const proposals = await getMatchProposals(supabase);
    return NextResponse.json({ proposals });
  } catch (err: any) {
    console.error('GET matching proposals error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
