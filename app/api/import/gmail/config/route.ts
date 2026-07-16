import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const { email_address } = await request.json();
    
    if (!email_address || !email_address.includes('@')) {
      return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 });
    }
    
    const supabase = createServerClient();
    
    // Check if there is an existing config
    const { data: existingConfig } = await supabase
      .from('gmail_sync_config')
      .select('id')
      .maybeSingle();
      
    if (existingConfig) {
      // Update existing
      await supabase
        .from('gmail_sync_config')
        .update({
          email_address: email_address,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingConfig.id);
    } else {
      // Insert new
      await supabase
        .from('gmail_sync_config')
        .insert({
          email_address: email_address,
          last_sync_at: new Date('2026-06-01T00:00:00Z').toISOString()
        });
    }
    
    return NextResponse.json({ success: true, email_address });
  } catch (err: any) {
    console.error('Error in Gmail Config Route:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
