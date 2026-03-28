import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';
import { RP_NAME, RP_ID, CHALLENGE_TTL_MINUTES } from '@/lib/passkey';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  try {
    // Require authenticated user
    const { createServerClient } = await import('@supabase/ssr');
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );

    const { data: { session } } = await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);

    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    // Fetch existing passkeys to exclude (prevents re-registering same authenticator)
    const { data: existing } = await supabaseAdmin
      .from('user_passkeys')
      .select('credential_id, transports')
      .eq('user_id', userId);

    const excludeCredentials = (existing || []).map(pk => ({
      id: pk.credential_id,
      transports: pk.transports as AuthenticatorTransport[] | undefined,
    }));

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: userEmail,
      userDisplayName: userEmail.split('@')[0],
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    // Store challenge in DB (Vercel functions are stateless)
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000).toISOString();
    await supabaseAdmin.from('passkey_challenges').insert({
      challenge: options.challenge,
      user_id: userId,
      type: 'registration',
      expires_at: expiresAt,
    });

    return NextResponse.json(options);
  } catch (err) {
    console.error('[passkey/register/options]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
