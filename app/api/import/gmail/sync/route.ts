import { NextResponse } from 'next/server';
import { syncGmailInvoices } from '@/lib/gmail/sync';

export async function POST(request: Request) {
  try {
    console.log('[API] Starting manual Gmail sync...');
    const result = await syncGmailInvoices();
    
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error in manual Gmail sync:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
