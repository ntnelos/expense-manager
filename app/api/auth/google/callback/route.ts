import { google } from 'googleapis';
import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  
  if (error) {
    return NextResponse.redirect(new URL(`/settings?error=oauth_denied&message=${encodeURIComponent(error)}`, request.url));
  }
  
  if (!code) {
    return NextResponse.redirect(new URL('/settings?error=missing_code', request.url));
  }
  
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    if (!tokens.refresh_token) {
      console.warn('[Google OAuth] No refresh token returned. User might need to re-consent.');
    }
    
    // Get user's email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;
    
    if (!email) {
      throw new Error('Could not retrieve user email from Google');
    }
    
    const supabase = createServerClient();
    
    // Check if there is an existing config
    const { data: existingConfig } = await supabase
      .from('gmail_sync_config')
      .select('id, refresh_token')
      .eq('email_address', email)
      .maybeSingle();
      
    const refreshTokenToSave = tokens.refresh_token || existingConfig?.refresh_token;
    
    if (!refreshTokenToSave) {
      // If we don't have a refresh token and none was returned, we can't do offline sync
      return NextResponse.redirect(new URL('/settings?error=no_refresh_token', request.url));
    }
    
    if (existingConfig) {
      await supabase
        .from('gmail_sync_config')
        .update({
          refresh_token: refreshTokenToSave,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingConfig.id);
    } else {
      // Start scanning from June 1st, 2026 by default for new setups
      await supabase
        .from('gmail_sync_config')
        .insert({
          email_address: email,
          refresh_token: refreshTokenToSave,
          last_sync_at: new Date('2026-06-01T00:00:00Z').toISOString()
        });
    }
    
    return NextResponse.redirect(new URL('/settings?success=gmail_connected', request.url));
  } catch (err: any) {
    console.error('Error in Google OAuth Callback:', err);
    return NextResponse.redirect(new URL(`/settings?error=oauth_failed&message=${encodeURIComponent(err.message)}`, request.url));
  }
}
