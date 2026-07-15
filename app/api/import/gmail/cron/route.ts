import { NextResponse } from 'next/server';
import { syncGmailInvoices } from '@/lib/gmail/sync';

export async function GET(request: Request) {
  // Verify that the request is coming from Vercel Cron
  // or a developer authorized request.
  const authHeader = request.headers.get('authorization');
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && request.headers.get('x-vercel-cron') !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[Cron API] Starting scheduled Gmail sync...');
    const result = await syncGmailInvoices();
    
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Cron API] Error in scheduled Gmail sync:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
