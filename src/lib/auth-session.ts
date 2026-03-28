import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface SessionTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: { id: string; email?: string; [key: string]: unknown };
}

interface UserState {
  neighborhoodIds: string[];
  isSubscribed: boolean;
  profile: {
    timezone?: string;
    childcare?: boolean;
    prefsToken?: string;
    theme?: string;
    language?: string;
  };
}

/**
 * Create a Supabase session for a user by generating and immediately verifying a magic link.
 * The user never sees or clicks the link - it's purely a mechanism to mint a valid session.
 */
export async function createSessionForUser(email: string): Promise<SessionTokens> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Generate magic link (creates a one-time token)
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (error || !data?.properties?.action_link) {
    throw new Error(`Failed to generate session link: ${error?.message || 'no action_link'}`);
  }

  // Extract token_hash from the action link URL
  const url = new URL(data.properties.action_link);
  const tokenHash = url.searchParams.get('token');
  const tokenType = url.searchParams.get('type') || 'magiclink';

  if (!tokenHash) {
    throw new Error('No token in generated link');
  }

  // Verify the token immediately (server-to-server)
  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token_hash: tokenHash,
      type: tokenType,
    }),
  });

  if (!verifyRes.ok) {
    const errData = await verifyRes.json().catch(() => ({}));
    throw new Error(`Session verification failed: ${errData.error_description || verifyRes.status}`);
  }

  const tokenData = await verifyRes.json();

  if (!tokenData.access_token || !tokenData.refresh_token) {
    throw new Error('No session tokens in verify response');
  }

  return tokenData as SessionTokens;
}

/**
 * Fetch user's neighborhood preferences, newsletter status, and profile data.
 */
export async function fetchUserState(userId: string, email: string): Promise<UserState> {
  const adminHeaders = { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` };
  const result: UserState = { neighborhoodIds: [], isSubscribed: false, profile: {} };

  try {
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
        `${supabaseUrl}/rest/v1/profiles?select=primary_timezone,childcare_mode_enabled,email_unsubscribe_token,preferred_theme,preferred_language&id=eq.${userId}&limit=1`,
        { headers: adminHeaders }
      ),
    ]);

    if (prefsRes.ok) {
      const prefs = await prefsRes.json();
      result.neighborhoodIds = prefs.map((p: { neighborhood_id: string }) => p.neighborhood_id);
    }
    if (subRes.ok) {
      const subs = await subRes.json();
      result.isSubscribed = Array.isArray(subs) && subs.length > 0;
    }
    if (profileRes.ok) {
      const profiles = await profileRes.json();
      const p = profiles?.[0];
      if (p) {
        result.profile = {
          timezone: p.primary_timezone || undefined,
          childcare: p.childcare_mode_enabled || false,
          prefsToken: p.email_unsubscribe_token || undefined,
          theme: p.preferred_theme || undefined,
          language: p.preferred_language || undefined,
        };
      }
    }
  } catch {
    // Non-critical - client-side sync will fill later
  }

  return result;
}

/**
 * Set Supabase auth session cookies on a NextResponse.
 * Matches the chunked cookie format from @supabase/ssr.
 */
export function setSessionCookies(response: NextResponse, tokenData: SessionTokens): void {
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
    response.cookies.set(storageKey, '', { ...cookieOptions, maxAge: 0 });
    for (let i = 0; i * CHUNK_SIZE < sessionJson.length; i++) {
      response.cookies.set(
        `${storageKey}.${i}`,
        sessionJson.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        cookieOptions
      );
    }
  }
}
