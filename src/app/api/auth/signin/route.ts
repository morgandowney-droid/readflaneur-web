import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// Server-side sign-in that bypasses CAPTCHA by calling GoTrue REST API
// directly with the service role key. Used when client-side CAPTCHA fails.
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Call GoTrue REST API directly - service role key bypasses CAPTCHA
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({ error_description: 'Sign in failed' }));
      return NextResponse.json(
        { error: err.error_description || err.msg || 'Invalid email or password' },
        { status: 401 }
      );
    }

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token || !tokenData.refresh_token) {
      return NextResponse.json({ error: 'No session created' }, { status: 500 });
    }

    // Set server-side cookies
    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(
        supabaseUrl,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return cookieStore.getAll(); },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            },
          },
        }
      );

      await Promise.race([
        supabase.auth.setSession({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
        }),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // Cookie setting failed - client will still have the tokens
    }

    return NextResponse.json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
    });
  } catch (err) {
    console.error('Admin signin error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
