import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = createServerClient();
    
    const { error } = await supabase
      .from('gmail_sync_config')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all rows (we only have one anyway)
      
    if (error) {
      throw error;
    }
    
    return NextResponse.json({ success: true, message: 'Gmail disconnected successfully' });
  } catch (error: any) {
    console.error('[API] Error disconnecting Gmail:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
