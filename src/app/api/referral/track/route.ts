import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/referral/track
 * Record a click when someone visits /invite?ref=CODE
 * Fire-and-forget from the client - always returns 200
 */
export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ ok: true }); // Silent fail
    }

    const trimmedCode = code.trim().toLowerCase();

    // Look up referrer in profiles first, then newsletter_subscribers
    let referrerType: 'profile' | 'newsletter' | null = null;
    let referrerId: string | null = null;

    const { data: profile } = await getSupabaseAdmin()
      .from('profiles')
      .select('id')
      .eq('referral_code', trimmedCode)
      .single();

    if (profile) {
      referrerType = 'profile';
      referrerId = profile.id;
    } else {
      const { data: subscriber } = await getSupabaseAdmin()
        .from('newsletter_subscribers')
        .select('id')
        .eq('referral_code', trimmedCode)
        .single();

      if (subscriber) {
        referrerType = 'newsletter';
        referrerId = subscriber.id;
      }
    }

    if (!referrerType || !referrerId) {
      return NextResponse.json({ ok: true }); // Invalid code, silent fail
    }

    // Hash IP for dedup (don't store raw IPs)
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
    const ipHash = createHash('sha256').update(ip + trimmedCode).digest('hex');

    // Check for recent click from same IP+code (dedup within 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await getSupabaseAdmin()
      .from('referrals')
      .select('id')
      .eq('ip_hash', ipHash)
      .gte('clicked_at', oneDayAgo)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true }); // Already tracked
    }

    await getSupabaseAdmin().from('referrals').insert({
      referral_code: trimmedCode,
      referrer_type: referrerType,
      referrer_id: referrerId,
      status: 'clicked',
      ip_hash: ipHash,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Referral track error:', err);
    return NextResponse.json({ ok: true }); // Always 200
  }
}
