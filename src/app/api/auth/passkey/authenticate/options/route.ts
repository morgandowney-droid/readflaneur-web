import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';
import { RP_ID, CHALLENGE_TTL_MINUTES } from '@/lib/passkey';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  try {
    // No auth required - this is the login flow
    // Uses discoverable credentials (conditional UI) - no email needed
    // The browser's passkey manager shows all available passkeys for this RP_ID

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'preferred',
      // Empty allowCredentials = discoverable credentials (conditional UI)
      // Browser shows all passkeys registered for readflaneur.com
    });

    // Store challenge in DB
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000).toISOString();
    await supabaseAdmin.from('passkey_challenges').insert({
      challenge: options.challenge,
      type: 'authentication',
      expires_at: expiresAt,
    });

    return NextResponse.json(options);
  } catch (err) {
    console.error('[passkey/authenticate/options]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
