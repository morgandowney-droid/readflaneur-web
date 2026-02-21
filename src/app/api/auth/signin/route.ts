import { NextRequest, NextResponse } from 'next/server';

// Server-side sign-in via GoTrue REST API with service role key.
// Primary login path — client sends credentials + optional Turnstile token.
// Validates Turnstile server-side, then authenticates with GoTrue.
export async function POST(request: NextRequest) {
  try {
    const { email, password, captchaToken, clientNeighborhoods } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    // Validate Turnstile token server-side (if configured + token provided)
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret && captchaToken) {
      try {
        const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            secret: turnstileSecret,
            response: captchaToken,
          }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyData.success) {
          return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 403 });
        }
      } catch {
        // Turnstile verification failed — allow login to proceed
        // (don't block real users due to Cloudflare outage)
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Call GoTrue REST API directly
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

    // Fetch user's neighborhood preferences + profile server-side (service role key,
    // no navigator.locks). Returned to client so login page can write to localStorage
    // before redirect — ensures feed renders with correct neighborhoods immediately.
    let neighborhoodIds: string[] = [];
    let isSubscribed = false;
    let profileData: { timezone?: string; childcare?: boolean; prefsToken?: string } = {};
    try {
      const userId = tokenData.user?.id;
      if (userId) {
        const adminHeaders = { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` };
        const [prefsRes, subRes, profileRes] = await Promise.all([
          fetch(
            `${supabaseUrl}/rest/v1/user_neighborhood_preferences?select=neighborhood_id&user_id=eq.${userId}`,
            { headers: adminHeaders }
          ),
          fetch(
            `${supabaseUrl}/rest/v1/newsletter_subscribers?select=id&email=eq.${encodeURIComponent(email.toLowerCase().trim())}&limit=1`,
            { headers: adminHeaders }
          ),
          fetch(
            `${supabaseUrl}/rest/v1/profiles?select=primary_timezone,childcare_mode_enabled,email_unsubscribe_token&id=eq.${userId}&limit=1`,
            { headers: adminHeaders }
          ),
        ]);
        if (prefsRes.ok) {
          const prefs = await prefsRes.json();
          neighborhoodIds = prefs.map((p: { neighborhood_id: string }) => p.neighborhood_id);
        }
        if (subRes.ok) {
          const subs = await subRes.json();
          isSubscribed = Array.isArray(subs) && subs.length > 0;
        }
        if (profileRes.ok) {
          const profiles = await profileRes.json();
          const p = profiles?.[0];
          if (p) {
            profileData = {
              timezone: p.primary_timezone || undefined,
              childcare: p.childcare_mode_enabled || false,
              prefsToken: p.email_unsubscribe_token || undefined,
            };
          }
        }
      }
    } catch {
      // Non-critical — client-side sync will fill later
    }

    // Bootstrap DB from client neighborhoods if DB is empty.
    // This is the key fix for cross-device sync: every login pushes the client's
    // neighborhoods to DB via service role key (100% reliable, no RLS/session issues).
    if (neighborhoodIds.length === 0 && Array.isArray(clientNeighborhoods) && clientNeighborhoods.length > 0) {
      try {
        const userId = tokenData.user?.id;
        if (userId) {
          const rows = clientNeighborhoods
            .filter((id: unknown) => typeof id === 'string' && id.length > 0)
            .map((id: string) => ({
              user_id: userId,
              neighborhood_id: id,
            }));

          if (rows.length > 0) {
            const insertRes = await fetch(
              `${supabaseUrl}/rest/v1/user_neighborhood_preferences`,
              {
                method: 'POST',
                headers: {
                  'apikey': serviceRoleKey,
                  'Authorization': `Bearer ${serviceRoleKey}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=minimal',
                },
                body: JSON.stringify(rows),
              }
            );
            if (insertRes.ok) {
              neighborhoodIds = rows.map((r: { neighborhood_id: string }) => r.neighborhood_id);
              console.log(`[signin] Bootstrapped ${rows.length} neighborhoods to DB for user ${userId}`);
            }
          }
        }
      } catch {
        // Non-critical — neighborhoods will sync later
      }
    }

    // Build response with full session data + user state
    const response = NextResponse.json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      expires_at: tokenData.expires_at,
      token_type: tokenData.token_type || 'bearer',
      user: tokenData.user,
      neighborhood_ids: neighborhoodIds,
      is_subscribed: isSubscribed,
      profile: profileData,
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
