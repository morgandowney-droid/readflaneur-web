import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseUserAgent, hashIPSHA256 } from '@/lib/device-detection';
import { moderateTipContent } from '@/lib/moderation';
import { notifyAdminNewTip } from '@/lib/email';
import type { TipSubmission, CreditPreference } from '@/types';

// Rate limit: 5 tips per hour per IP
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get user if authenticated (optional)
    const { data: { user } } = await supabase.auth.getUser();

    // Parse request body
    const body: TipSubmission = await request.json();

    // Validate required fields
    if (!body.content || body.content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Tip content is required' },
        { status: 400 }
      );
    }

    if (!body.neighborhood_id) {
      return NextResponse.json(
        { error: 'Neighborhood is required' },
        { status: 400 }
      );
    }

    if (!body.terms_accepted) {
      return NextResponse.json(
        { error: 'You must accept the terms to submit a tip' },
        { status: 400 }
      );
    }

    // Validate neighborhood exists
    const { data: neighborhood, error: neighborhoodError } = await supabase
      .from('neighborhoods')
      .select('id, name')
      .eq('id', body.neighborhood_id)
      .single();

    if (neighborhoodError || !neighborhood) {
      return NextResponse.json(
        { error: 'Invalid neighborhood' },
        { status: 400 }
      );
    }

    // Get IP address for rate limiting and tracking
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const salt = process.env.CRON_SECRET || 'default-salt';
    const ipHash = await hashIPSHA256(ip, salt);

    // Check rate limit
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString();
    const { count: recentTips } = await supabase
      .from('tips')
      .select('*', { count: 'exact', head: true })
      .eq('ip_address_hash', ipHash)
      .gte('created_at', windowStart);

    if (recentTips !== null && recentTips >= RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // Validate photo count
    const photoUrls = body.photo_urls || [];
    if (photoUrls.length > 5) {
      return NextResponse.json(
        { error: 'Maximum 5 photos allowed' },
        { status: 400 }
      );
    }

    // Run content moderation
    const moderationResult = await moderateTipContent(body.content, body.headline);
    if (!moderationResult.passed) {
      return NextResponse.json({
        success: false,
        rejected: true,
        reason: moderationResult.reason,
        flags: moderationResult.flags,
      }, { status: 400 });
    }

    // Parse device info
    const userAgent = request.headers.get('user-agent') || null;
    const deviceInfo = parseUserAgent(userAgent);
    const timezone = request.headers.get('x-timezone') || null;
    const screenResolution = request.headers.get('x-screen-resolution') || null;
    const language = request.headers.get('accept-language')?.split(',')[0] || null;

    // Validate credit preference
    const validCreditPreferences: CreditPreference[] = ['anonymous', 'name_only', 'name_and_contact'];
    const creditPreference = validCreditPreferences.includes(body.credit_preference)
      ? body.credit_preference
      : 'anonymous';

    // Create tip record
    const { data: tip, error: insertError } = await supabase
      .from('tips')
      .insert({
        content: body.content.trim(),
        headline: body.headline?.trim() || null,
        neighborhood_id: body.neighborhood_id,
        user_id: user?.id || null,
        submitter_name: body.submitter_name?.trim() || null,
        submitter_email: body.submitter_email?.trim() || null,
        submitter_phone: body.submitter_phone?.trim() || null,
        credit_preference: creditPreference,
        allow_credit: body.allow_credit || false,
        gps_latitude: body.gps_latitude || null,
        gps_longitude: body.gps_longitude || null,
        gps_accuracy: body.gps_accuracy || null,
        ip_address_hash: ipHash,
        timezone,
        user_agent: userAgent,
        device_type: deviceInfo.device_type,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        screen_resolution: screenResolution,
        language,
        photo_urls: photoUrls,
        status: 'pending',
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
        terms_version: body.terms_version || '1.0',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Tip insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to submit tip' },
        { status: 500 }
      );
    }

    // Insert photo records if any
    if (photoUrls.length > 0) {
      const photoRecords = photoUrls.map((url, index) => ({
        tip_id: tip.id,
        storage_path: url, // Using URL as path since we store public URLs
        public_url: url,
        order_index: index,
      }));

      const { error: photoError } = await supabase
        .from('tip_photos')
        .insert(photoRecords);

      if (photoError) {
        console.error('Photo records insert error:', photoError);
        // Continue - tip was created, photos are in photo_urls
      }
    }

    // Send admin notification
    await notifyAdminNewTip({
      id: tip.id,
      content: body.content,
      headline: body.headline,
      neighborhood_name: neighborhood.name,
      submitter_name: body.submitter_name,
      submitter_email: body.submitter_email,
      photo_count: photoUrls.length,
      is_anonymous: !user && !body.submitter_email,
    });

    return NextResponse.json({
      success: true,
      tipId: tip.id,
    });
  } catch (error) {
    console.error('Tip submission error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
