import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/referral/stats
 * Return click/conversion counts for the current user's referral code
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const token = searchParams.get('token');

    let referralCode: string | null = null;

    // Try session auth first
    const supabase = await createServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      const { data: profile } = await getSupabaseAdmin()
        .from('profiles')
        .select('referral_code')
        .eq('id', session.user.id)
        .single();
      referralCode = profile?.referral_code || null;
    } else if (email && token) {
      const { data: subscriber } = await getSupabaseAdmin()
        .from('newsletter_subscribers')
        .select('referral_code')
        .eq('email', email.toLowerCase().trim())
        .eq('unsubscribe_token', token)
        .single();
      referralCode = subscriber?.referral_code || null;
    } else {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!referralCode) {
      return NextResponse.json({ code: null, clicks: 0, conversions: 0 });
    }

    // Count clicks and conversions
    const { count: clicks } = await getSupabaseAdmin()
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('referral_code', referralCode);

    const { count: conversions } = await getSupabaseAdmin()
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('referral_code', referralCode)
      .eq('status', 'converted');

    return NextResponse.json({
      code: referralCode,
      clicks: clicks || 0,
      conversions: conversions || 0,
    });
  } catch (err) {
    console.error('Referral stats error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
