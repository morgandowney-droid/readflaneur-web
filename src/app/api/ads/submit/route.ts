import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { moderateAd } from '@/lib/moderation';
import { notifyAdminNewAd } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { headline, imageUrl, clickUrl, isGlobal, neighborhoodId, placement = 'feed' } = body;

    // Validate required fields
    if (!headline || !imageUrl || !clickUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!isGlobal && !neighborhoodId) {
      return NextResponse.json(
        { error: 'Please select a neighborhood or choose global targeting' },
        { status: 400 }
      );
    }

    // Run AI moderation
    const moderationResult = await moderateAd(headline, clickUrl, imageUrl);

    if (!moderationResult.passed) {
      // AI rejected - return immediately with reason
      return NextResponse.json({
        success: false,
        rejected: true,
        reason: moderationResult.reason,
        flags: moderationResult.flags,
      });
    }

    // AI passed - create ad with pending_review status
    const { data: ad, error: insertError } = await supabase
      .from('ads')
      .insert({
        advertiser_id: user.id,
        headline,
        image_url: imageUrl,
        click_url: clickUrl,
        is_global: isGlobal,
        neighborhood_id: isGlobal ? null : neighborhoodId,
        placement,
        status: 'pending_review',
        sponsor_label: 'SPONSORED',
      })
      .select()
      .single();

    if (insertError || !ad) {
      console.error('Insert error:', insertError);
      return NextResponse.json(
        { error: insertError?.message || 'Failed to create ad' },
        { status: 500 }
      );
    }

    // Get neighborhood name if applicable
    let neighborhoodName = undefined;
    if (!isGlobal && neighborhoodId) {
      const { data: neighborhood } = await supabase
        .from('neighborhoods')
        .select('name, city')
        .eq('id', neighborhoodId)
        .single();

      if (neighborhood) {
        neighborhoodName = `${neighborhood.name}, ${neighborhood.city}`;
      }
    }

    // Notify admin
    await notifyAdminNewAd({
      id: ad.id,
      headline: ad.headline,
      image_url: ad.image_url,
      click_url: ad.click_url,
      advertiser_email: user.email || 'Unknown',
      is_global: isGlobal,
      neighborhood_name: neighborhoodName,
    });

    return NextResponse.json({
      success: true,
      adId: ad.id,
      status: 'pending_review',
      message: 'Your ad has been submitted for review. You will receive an email once it is approved.',
    });
  } catch (error) {
    console.error('Ad submission error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
