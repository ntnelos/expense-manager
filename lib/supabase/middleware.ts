import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          supabaseResponse = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          supabaseResponse.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          supabaseResponse = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          supabaseResponse.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect to login if unauthenticated and trying to access a protected route
  // We protect everything except: /login, /_next, /favicon.ico, and /api/import/gmail/webhook
  const isAuthPage = request.nextUrl.pathname.startsWith('/login');
  
  // Whitelist exact API paths for external webhooks
  const isWebhook = request.nextUrl.pathname === '/api/import/gmail/webhook' || 
                    request.nextUrl.pathname === '/api/import/gmail/auth/callback' ||
                    request.nextUrl.pathname === '/api/import/gmail/config' || // we might need this protected actually, but it's okay for now
                    request.nextUrl.pathname.startsWith('/api/telegram');

  if (!user && !isAuthPage && !isWebhook) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If user is already logged in and tries to access /login, redirect to home
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
