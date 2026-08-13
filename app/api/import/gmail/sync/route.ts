import { NextResponse } from 'next/server';
import { syncGmailInvoices } from '@/lib/gmail/sync';
import { GmailSyncTracker } from '@/lib/gmail/tracker';

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

    console.log('[API] Starting manual Gmail sync in background...');
    
    // Kick off the sync without blocking the HTTP request
    // The tracker keeps state and persists to DB
    syncGmailInvoices({ triggerType: 'manual' }).catch(err => {
      console.error('[API] Uncaught error in background sync:', err);
    });

    // Give it a tiny fraction to initialize run state
    await new Promise(resolve => setTimeout(resolve, 100));

    const currentRun = GmailSyncTracker.getActiveRun();

    return NextResponse.json({
      success: true,
      started: true,
      runId: currentRun?.id,
      activeRun: currentRun,
      message: 'הסריקה החלה בהצלחה'
    });
  } catch (error: any) {
    console.error('[API] Error initiating manual Gmail sync:', error);
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
