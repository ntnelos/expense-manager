import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const { email_address, last_sync_at } = await request.json();
    
    if (email_address && !email_address.includes('@')) {
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
      const updateData: any = {
        updated_at: new Date().toISOString()
      };
      if (email_address) updateData.email_address = email_address;
      if (last_sync_at !== undefined) updateData.last_sync_at = last_sync_at;

      await supabase
        .from('gmail_sync_config')
        .update(updateData)
        .eq('id', existingConfig.id);
    } else {
      if (!email_address) {
        return NextResponse.json({ error: 'כתובת מייל נדרשת' }, { status: 400 });
      }
      // Insert new
      await supabase
        .from('gmail_sync_config')
        .insert({
          email_address: email_address,
          last_sync_at: last_sync_at || new Date('2026-06-10T00:00:00Z').toISOString()
        });
    }
    
    return NextResponse.json({ success: true, email_address, last_sync_at });
  } catch (err: any) {
    console.error('Error in Gmail Config Route:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { last_sync_at } = await request.json();
    
    if (!last_sync_at) {
      return NextResponse.json({ error: 'תאריך סריקה נדרש' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: existingConfig } = await supabase
      .from('gmail_sync_config')
      .select('id')
      .maybeSingle();

    if (!existingConfig) {
      return NextResponse.json({ error: 'תצורת ג’ימייל לא נמצאה' }, { status: 404 });
    }

    await supabase
      .from('gmail_sync_config')
      .update({
        last_sync_at: new Date(last_sync_at).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', existingConfig.id);

    return NextResponse.json({ success: true, last_sync_at });
  } catch (err: any) {
    console.error('Error updating last_sync_at:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = createServerClient();
    
    const { data, error } = await supabase
      .from('gmail_sync_config')
      .select('email_address, last_sync_at')
      .maybeSingle();
      
    if (error) {
      console.error('Error fetching config:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ config: data });
  } catch (err: any) {
    console.error('Error in GET config:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
