import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { notifyAdvertiserApproved, notifyAdvertiserRejected, notifyCustomerProofReady } from '@/lib/email';
import { processAdQuality } from '@/lib/ad-quality-service';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { adId, action, reason, headline, adminNotes, body: adBody } = body;

    if (!adId || !action) {
      return NextResponse.json(
        { error: 'Missing adId or action' },
        { status: 400 }
      );
    }

    if (!['approve', 'reject', 'run_ai_check', 'send_proof'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    // Handle AI check action
    if (action === 'run_ai_check') {
      const serviceSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const result = await processAdQuality(adId, serviceSupabase);
      if (!result.success) {
        return NextResponse.json({ error: 'AI check failed' }, { status: 500 });
      }
      return NextResponse.json({ success: true, action: 'run_ai_check', autoRejected: result.autoRejected });
    }

    // Handle send proof action
    if (action === 'send_proof') {
      const serviceSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Run AI check first (ensures approval_status advances)
      await processAdQuality(adId, serviceSupabase);

      // Fetch ad for proof email
      const { data: proofAd } = await serviceSupabase
        .from('ads')
        .select('client_email, client_name, headline, proof_token')
        .eq('id', adId)
        .single();

      if (proofAd?.client_email && proofAd?.proof_token) {
        await notifyCustomerProofReady({
          clientEmail: proofAd.client_email,
          clientName: proofAd.client_name || 'Advertiser',
          headline: proofAd.headline || 'Your Placement',
          proofToken: proofAd.proof_token,
        });
        return NextResponse.json({ success: true, action: 'send_proof', email: proofAd.client_email });
      }

      return NextResponse.json({ error: 'No client email on this ad' }, { status: 400 });
    }

    if (action === 'reject' && !reason) {
      return NextResponse.json(
        { error: 'Rejection reason required' },
        { status: 400 }
      );
    }

    // Fetch the ad with advertiser info
    const { data: ad, error: fetchError } = await supabase
      .from('ads')
      .select(`
        *,
        advertiser:profiles!ads_advertiser_id_fkey(email)
      `)
      .eq('id', adId)
      .single();

    if (fetchError || !ad) {
      return NextResponse.json(
        { error: 'Ad not found' },
        { status: 404 }
      );
    }

    if (ad.status !== 'pending_review') {
      return NextResponse.json(
        { error: 'Ad is not pending review' },
        { status: 400 }
      );
    }

    // Update ad status — approve goes directly to 'active' (one-click go-live)
    // Also sets approval_status to 'approved' (admin bypass of customer proof)
    const updateData: Record<string, string | undefined> = {
      status: action === 'approve' ? 'active' : 'rejected',
      approval_status: action === 'approve' ? 'approved' : undefined,
    };

    if (action === 'reject') {
      updateData.rejection_reason = reason;
    }

    // Admin can fix headline typos before approving
    if (headline && typeof headline === 'string' && headline.trim()) {
      updateData.headline = headline.trim();
    }

    // Save internal admin notes
    if (adminNotes !== undefined) {
      updateData.admin_notes = adminNotes || undefined;
    }

    // Save ad body copy (Sunday Edition)
    if (adBody !== undefined) {
      updateData.body = adBody || undefined;
    }

    const { error: updateError } = await supabase
      .from('ads')
      .update(updateData)
      .eq('id', adId);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update ad' },
        { status: 500 }
      );
    }

    // Send notification to advertiser (or Passionfroot client)
    const advertiserEmail = ad.advertiser?.email || ad.client_email;
    const finalHeadline = (headline && headline.trim()) || ad.headline;
    if (advertiserEmail) {
      if (action === 'approve') {
        await notifyAdvertiserApproved({
          headline: finalHeadline,
          advertiser_email: advertiserEmail,
        });
      } else {
        await notifyAdvertiserRejected({
          headline: finalHeadline,
          advertiser_email: advertiserEmail,
          rejection_reason: reason,
        });
      }
    }

    return NextResponse.json({
      success: true,
      action,
      adId,
    });
  } catch (error) {
    console.error('Review error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
