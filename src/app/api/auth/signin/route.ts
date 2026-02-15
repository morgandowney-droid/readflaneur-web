import { NextRequest, NextResponse } from 'next/server';

// Server-side sign-in that bypasses CAPTCHA by calling GoTrue REST API
// directly with the service role key. Used when client-side auth fails/times out.
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

    // Build response with full session data
    const response = NextResponse.json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      expires_at: tokenData.expires_at,
      token_type: tokenData.token_type || 'bearer',
      user: tokenData.user,
    });

    // Set auth cookies directly in the response (bypasses setSession's getUser hang)
    // @supabase/ssr reads these cookies via document.cookie on the client
    try {
      const ref = new URL(supabaseUrl).hostname.split('.')[0];
      const storageKey = `sb-${ref}-auth-token`;

      const session = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_type: tokenData.token_type || 'bearer',
        expires_in: tokenData.expires_in,
        expires_at: tokenData.expires_at,
        user: tokenData.user,
      };

      const sessionJson = JSON.stringify(session);
      const CHUNK_SIZE = 3180;
      const isProduction = process.env.NODE_ENV === 'production';
      const cookieOptions = {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax' as const,
        httpOnly: false,
        secure: isProduction,
      };

      // Clear any existing chunked cookies
      for (let i = 0; i < 5; i++) {
        response.cookies.set(`${storageKey}.${i}`, '', { ...cookieOptions, maxAge: 0 });
      }

      if (sessionJson.length <= CHUNK_SIZE) {
        response.cookies.set(storageKey, sessionJson, cookieOptions);
      } else {
        // Chunk the session data (matching @supabase/ssr format)
        response.cookies.set(storageKey, '', { ...cookieOptions, maxAge: 0 });
        for (let i = 0; i * CHUNK_SIZE < sessionJson.length; i++) {
          response.cookies.set(
            `${storageKey}.${i}`,
            sessionJson.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
            cookieOptions
          );
        }
      }
    } catch (e) {
      console.error('Failed to set auth cookies:', e);
    }

    return response;
  } catch (err) {
    console.error('Admin signin error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
