import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/referral/convert
 * Record a conversion when a referred user subscribes.
 * Called fire-and-forget after successful subscribe.
 */
export async function POST(request: NextRequest) {
  try {
    const { code, email } = await request.json();
    if (!code || !email) {
      return NextResponse.json({ ok: true }); // Silent fail
    }

    const trimmedCode = code.trim().toLowerCase();
    const normalizedEmail = email.toLowerCase().trim();

    // Look up referrer
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
      return NextResponse.json({ ok: true }); // Invalid code
    }

    // Prevent self-referral
    if (referrerType === 'profile') {
      const { data: selfProfile } = await getSupabaseAdmin()
        .from('profiles')
        .select('email')
        .eq('id', referrerId)
        .single();
      if (selfProfile?.email?.toLowerCase() === normalizedEmail) {
        return NextResponse.json({ ok: true });
      }
    } else {
      const { data: selfSub } = await getSupabaseAdmin()
        .from('newsletter_subscribers')
        .select('email')
        .eq('id', referrerId)
        .single();
      if (selfSub?.email?.toLowerCase() === normalizedEmail) {
        return NextResponse.json({ ok: true });
      }
    }

    // Look up referred user
    let referredType: 'profile' | 'newsletter' | null = null;
    let referredId: string | null = null;

    const { data: referredProfile } = await getSupabaseAdmin()
      .from('profiles')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (referredProfile) {
      referredType = 'profile';
      referredId = referredProfile.id;
    } else {
      const { data: referredSub } = await getSupabaseAdmin()
        .from('newsletter_subscribers')
        .select('id')
        .eq('email', normalizedEmail)
        .single();

      if (referredSub) {
        referredType = 'newsletter';
        referredId = referredSub.id;
      }
    }

    // Try to update an existing click row to converted
    const { data: existingClick } = await getSupabaseAdmin()
      .from('referrals')
      .select('id')
      .eq('referral_code', trimmedCode)
      .eq('status', 'clicked')
      .is('referred_email', null)
      .order('clicked_at', { ascending: false })
      .limit(1);

    if (existingClick && existingClick.length > 0) {
      await getSupabaseAdmin()
        .from('referrals')
        .update({
          status: 'converted',
          referred_email: normalizedEmail,
          referred_type: referredType,
          referred_id: referredId,
          converted_at: new Date().toISOString(),
        })
        .eq('id', existingClick[0].id);
    } else {
      // No click row - create a direct conversion (e.g. shared link outside invite page)
      await getSupabaseAdmin().from('referrals').insert({
        referral_code: trimmedCode,
        referrer_type: referrerType,
        referrer_id: referrerId,
        status: 'converted',
        referred_email: normalizedEmail,
        referred_type: referredType,
        referred_id: referredId,
        converted_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Referral convert error:', err);
    return NextResponse.json({ ok: true }); // Always 200
  }
}
