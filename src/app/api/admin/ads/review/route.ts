import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyAdvertiserApproved, notifyAdvertiserRejected } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

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
    const { adId, action, reason, headline, adminNotes } = body;

    if (!adId || !action) {
      return NextResponse.json(
        { error: 'Missing adId or action' },
        { status: 400 }
      );
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
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
    const updateData: Record<string, string | undefined> = {
      status: action === 'approve' ? 'active' : 'rejected',
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
