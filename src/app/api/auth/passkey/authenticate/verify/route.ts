import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';
import { RP_ID, RP_ORIGIN } from '@/lib/passkey';
import { createSessionForUser, fetchUserState, setSessionCookies } from '@/lib/auth-session';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { credential } = await request.json();

    if (!credential) {
      return NextResponse.json({ error: 'Missing credential' }, { status: 400 });
    }

    // Look up the passkey by credential ID
    const { data: passkey, error: lookupError } = await supabaseAdmin
      .from('user_passkeys')
      .select('*')
      .eq('credential_id', credential.id)
      .single();

    if (lookupError || !passkey) {
      return NextResponse.json({ error: 'Passkey not found' }, { status: 401 });
    }

    // Find a valid challenge (any unexpired authentication challenge)
    const { data: challenges } = await supabaseAdmin
      .from('passkey_challenges')
      .select('*')
      .eq('type', 'authentication')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    // Try each challenge (multiple users may have concurrent login attempts)
    let verified = false;
    let usedChallengeId: string | null = null;

    for (const challenge of (challenges || [])) {
      try {
        const verification = await verifyAuthenticationResponse({
          response: credential,
          expectedChallenge: challenge.challenge,
          expectedOrigin: RP_ORIGIN,
          expectedRPID: RP_ID,
          credential: {
            id: passkey.credential_id,
            publicKey: Buffer.from(passkey.public_key, 'base64'),
            counter: passkey.counter,
            transports: passkey.transports as AuthenticatorTransport[] | undefined,
          },
        });

        if (verification.verified) {
          verified = true;
          usedChallengeId = challenge.id;

          // Update counter and last_used_at
          await supabaseAdmin
            .from('user_passkeys')
            .update({
              counter: verification.authenticationInfo.newCounter,
              last_used_at: new Date().toISOString(),
            })
            .eq('id', passkey.id);

          break;
        }
      } catch {
        // Challenge didn't match, try next
        continue;
      }
    }

    if (!verified) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // Clean up used challenge
    if (usedChallengeId) {
      await supabaseAdmin.from('passkey_challenges').delete().eq('id', usedChallengeId);
    }

    // Get user email for session creation
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(passkey.user_id);
    if (!userData?.user?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 500 });
    }

    const email = userData.user.email;

    // Create Supabase session via magic link mint-and-verify
    const tokenData = await createSessionForUser(email);

    // Fetch user state (neighborhoods, profile, newsletter)
    const userState = await fetchUserState(tokenData.user.id, email);

    // Build response with session data
    const response = NextResponse.json({
      success: true,
      user: { id: tokenData.user.id, email },
      neighborhood_ids: userState.neighborhoodIds,
      is_subscribed: userState.isSubscribed,
      profile: userState.profile,
    });

    // Set auth cookies
    setSessionCookies(response, tokenData);

    return response;
  } catch (err) {
    console.error('[passkey/authenticate/verify]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
