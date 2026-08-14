import { NextResponse } from 'next/server';
import { syncGmailInvoices } from '@/lib/gmail/sync';
import { createServerClient } from '@/lib/supabase/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Verify that the request is coming from Vercel Cron
  // or a developer authorized request.
  const authHeader = request.headers.get('authorization');
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const isSecretValid = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  
  if (!isVercelCron && !isSecretValid) {
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

    const currentDay = new Date().getDate();
    const targetDay = config.auto_scan_day_of_month || 1;

    // Only run if today is the selected day of the month
    if (currentDay !== targetDay) {
      console.log(`[Cron API] Skipping sync. Today is ${currentDay}, scheduled for ${targetDay}.`);
      return NextResponse.json({ message: `Skipped. Scheduled for day ${targetDay}.` }, { status: 200 });
    }

    console.log('[Cron API] Starting scheduled Gmail sync...');
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
