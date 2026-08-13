import { NextResponse } from 'next/server';
import { syncGmailInvoices } from '@/lib/gmail/sync';
import { GmailSyncTracker } from '@/lib/gmail/tracker';

// Allow up to 60 seconds of execution in Vercel Serverless
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const active = GmailSyncTracker.getActiveRun();
    if (active && active.status === 'running') {
      return NextResponse.json({
        success: true,
        alreadyRunning: true,
        runId: active.id,
        activeRun: active,
        message: 'סריקה כבר רצה ברקע'
      });
    }

    console.log('[API] Starting manual Gmail sync...');
    
    // Await execution so the Serverless Function does not freeze mid-process
    const result = await syncGmailInvoices({ triggerType: 'manual' });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error in manual Gmail sync:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const activeRun = GmailSyncTracker.getActiveRun();
    const recentRuns = await GmailSyncTracker.getRecentRuns(5);

    return NextResponse.json({
      activeRun,
      recentRuns
    });
  } catch (error: any) {
    console.error('[API] Error fetching Gmail sync status:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
