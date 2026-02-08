import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processAdQuality } from '@/lib/ad-quality-service';
import { notifyCustomerProofReady } from '@/lib/email';

/**
 * POST /api/ads/quality
 *
 * Triggers AI quality check on an ad (image analysis + copy polish).
 * Auth: CRON_SECRET in Authorization header.
 * After processing, sends proof email to customer if client_email exists.
 */
export async function POST(request: NextRequest) {
  try {
    // Auth
    const secret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { adId } = await request.json();
    if (!adId) {
      return NextResponse.json({ error: 'Missing adId' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Run AI quality check
    const result = await processAdQuality(adId, supabase);

    if (!result.success) {
      return NextResponse.json({ error: 'Quality check failed' }, { status: 500 });
    }

    if (result.autoRejected) {
      return NextResponse.json({ success: true, autoRejected: true });
    }

    // Send proof email to customer if they have an email
    const { data: ad } = await supabase
      .from('ads')
      .select('client_email, client_name, headline, proof_token')
      .eq('id', adId)
      .single();

    if (ad?.client_email && ad?.proof_token) {
      await notifyCustomerProofReady({
        clientEmail: ad.client_email,
        clientName: ad.client_name || 'Advertiser',
        headline: ad.headline || 'Your Placement',
        proofToken: ad.proof_token,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Ad quality API error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
