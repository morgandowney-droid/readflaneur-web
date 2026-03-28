import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';
import { RP_ID, RP_ORIGIN } from '@/lib/passkey';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
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

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = session.user.id;
    const { credential, friendlyName } = await request.json();

    if (!credential) {
      return NextResponse.json({ error: 'Missing credential' }, { status: 400 });
    }

    // Retrieve and validate challenge
    const { data: challenges } = await supabaseAdmin
      .from('passkey_challenges')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'registration')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    const challenge = challenges?.[0];
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge expired or not found' }, { status: 400 });
    }

    // Delete used challenge
    await supabaseAdmin.from('passkey_challenges').delete().eq('id', challenge.id);

    // Verify registration
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge.challenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    const { credential: cred, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    // Store the passkey
    const { error: insertError } = await supabaseAdmin.from('user_passkeys').insert({
      user_id: userId,
      credential_id: cred.id,
      public_key: Buffer.from(cred.publicKey).toString('base64'),
      counter: cred.counter,
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp,
      transports: cred.transports || [],
      friendly_name: friendlyName || null,
    });

    if (insertError) {
      console.error('[passkey/register/verify] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save passkey' }, { status: 500 });
    }

    // Opportunistic cleanup of expired challenges
    await supabaseAdmin
      .from('passkey_challenges')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .then(null, () => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[passkey/register/verify]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
