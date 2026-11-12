import { NextResponse } from 'next/server';
import { syncGmailInvoices } from '@/lib/gmail/sync';
import { createServerClient } from '@/lib/supabase/server';

// Must stay above TIME_BUDGET_MS in lib/gmail/sync.ts (requires Vercel Fluid Compute, on by default).
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // This route is public at the proxy level (no user session), so it must authenticate itself.
  // When CRON_SECRET is set in the Vercel project, Vercel Cron sends it as "Authorization: Bearer <secret>".
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[Cron API] CRON_SECRET is not configured - refusing to run.');
    return NextResponse.json({ error: 'CRON_SECRET is not configured on the server' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const { data: config } = await supabase
      .from('gmail_sync_config')
      .select('auto_scan_day_of_month, email_address')
      .maybeSingle();

    if (!config || !config.email_address) {
      return NextResponse.json({ message: 'No active config. Skipping cron.' }, { status: 200 });
    }

    const now = new Date();
    const currentDay = now.getDate();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    // A day like 31 falls back to the month's last day, so short months still get a scan.
    const targetDay = Math.min(config.auto_scan_day_of_month || 1, lastDayOfMonth);

    // The cron fires daily. Besides the scheduled day, keep going on following days while the
    // latest run stopped early on the time limit and left messages behind.
    const { data: lastRun } = await supabase
      .from('gmail_sync_runs')
      .select('status')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const hasPendingBacklog = lastRun?.status === 'partial';

    if (currentDay !== targetDay && !hasPendingBacklog) {
      console.log(`[Cron API] Skipping sync. Today is ${currentDay}, scheduled for ${targetDay}.`);
      return NextResponse.json({ message: `Skipped. Scheduled for day ${targetDay}.` }, { status: 200 });
    }

    console.log(`[Cron API] Starting scheduled Gmail sync${hasPendingBacklog ? ' (continuing backlog)' : ''}...`);
    const result = await syncGmailInvoices({ triggerType: 'cron' });

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Cron API] Error in scheduled Gmail sync:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
