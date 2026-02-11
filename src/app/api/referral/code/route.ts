import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/referral/code
 * Get or lazy-generate a referral code for the current user.
 * Auth: session (profiles) or email+token query params (newsletter subscribers)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const token = searchParams.get('token');

    // Try session auth first
    const supabase = await createServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      // Authenticated user - look up or generate code from profiles
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id, referral_code')
        .eq('id', session.user.id)
        .single();

      if (!profile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }

      if (profile.referral_code) {
        return NextResponse.json({ code: profile.referral_code });
      }

      // Generate new code
      const { data: codeResult } = await supabaseAdmin.rpc('generate_referral_code');
      if (!codeResult) {
        return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
      }

      await supabaseAdmin
        .from('profiles')
        .update({ referral_code: codeResult })
        .eq('id', profile.id);

      return NextResponse.json({ code: codeResult });
    }

    // Newsletter subscriber auth via email+token
    if (email && token) {
      const { data: subscriber } = await supabaseAdmin
        .from('newsletter_subscribers')
        .select('id, referral_code')
        .eq('email', email.toLowerCase().trim())
        .eq('unsubscribe_token', token)
        .single();

      if (!subscriber) {
        return NextResponse.json({ error: 'Subscriber not found' }, { status: 404 });
      }

      if (subscriber.referral_code) {
        return NextResponse.json({ code: subscriber.referral_code });
      }

      const { data: codeResult } = await supabaseAdmin.rpc('generate_referral_code');
      if (!codeResult) {
        return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
      }

      await supabaseAdmin
        .from('newsletter_subscribers')
        .update({ referral_code: codeResult })
        .eq('id', subscriber.id);

      return NextResponse.json({ code: codeResult });
    }

    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  } catch (err) {
    console.error('Referral code error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
