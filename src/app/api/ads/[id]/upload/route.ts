import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processAdQuality } from '@/lib/ad-quality-service';
import { sendEmail } from '@/lib/email';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * POST /api/ads/[id]/upload
 *
 * Handles creative asset upload for a booked ad.
 * No auth required — secured by knowing the ad UUID (sent via email).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify ad exists and is in pending_assets status
    const { data: ad } = await supabase
      .from('ads')
      .select('id, status, customer_email, neighborhood_id, start_date, placement_type')
      .eq('id', adId)
      .single();

    if (!ad) {
      return NextResponse.json({ error: 'Ad not found' }, { status: 404 });
    }

    if (ad.status !== 'pending_assets') {
      return NextResponse.json(
        { error: 'Creative has already been submitted or ad is in wrong state' },
        { status: 400 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const sponsorLabel = formData.get('sponsorLabel') as string;
    const headline = formData.get('headline') as string;
    const body = (formData.get('body') as string) || '';
    const clickUrl = formData.get('clickUrl') as string;
    const imageFile = formData.get('image') as File | null;

    // Validate required fields
    if (!sponsorLabel?.trim()) {
      return NextResponse.json({ error: 'Brand name is required' }, { status: 400 });
    }
    if (!headline?.trim()) {
      return NextResponse.json({ error: 'Headline is required' }, { status: 400 });
    }
    if (headline.length > 60) {
      return NextResponse.json({ error: 'Headline must be 60 characters or less' }, { status: 400 });
    }
    if (body.length > 150) {
      return NextResponse.json({ error: 'Body copy must be 150 characters or less' }, { status: 400 });
    }
    if (!clickUrl?.trim()) {
      return NextResponse.json({ error: 'Click URL is required' }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(clickUrl);
    } catch {
      return NextResponse.json({ error: 'Click URL must be a valid URL' }, { status: 400 });
    }

    if (!imageFile) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    // Validate image
    if (!ALLOWED_TYPES.includes(imageFile.type)) {
      return NextResponse.json(
        { error: 'Image must be JPG, PNG, or WebP' },
        { status: 400 }
      );
    }
    if (imageFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Image must be under 2MB' },
        { status: 400 }
      );
    }

    // Upload image to Supabase Storage
    const fileExt = imageFile.name.split('.').pop() || 'jpg';
    const fileName = `${adId}.${fileExt}`;
    const fileBuffer = Buffer.from(await imageFile.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from('ad-assets')
      .upload(fileName, fileBuffer, {
        contentType: imageFile.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('ad-assets')
      .getPublicUrl(fileName);

    const imageUrl = publicUrlData.publicUrl;

    // Update ad row
    const { error: updateError } = await supabase
      .from('ads')
      .update({
        sponsor_label: sponsorLabel.trim(),
        headline: headline.trim(),
        body: body.trim() || null,
        click_url: clickUrl.trim(),
        image_url: imageUrl,
        status: 'in_review',
        approval_status: 'pending_ai',
      })
      .eq('id', adId);

    if (updateError) {
      console.error('Ad update error:', updateError);
      return NextResponse.json({ error: 'Failed to update ad' }, { status: 500 });
    }

    // Fire-and-forget: run AI quality check
    processAdQuality(adId, supabase).catch((err) =>
      console.error('Quality check failed:', err)
    );

    // Notify admin
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://readflaneur.com');

      let neighborhoodName = '';
      if (ad.neighborhood_id) {
        const { data: hood } = await supabase
          .from('neighborhoods')
          .select('name, city')
          .eq('id', ad.neighborhood_id)
          .single();
        if (hood) neighborhoodName = `${hood.name}, ${hood.city}`;
      }

      await sendEmail({
        to: adminEmail,
        subject: `Ad Creative Uploaded: ${sponsorLabel} — ${neighborhoodName || 'Global'}`,
        html: `
          <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px;">
            <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLÂNEUR</h1>
            <h2 style="font-weight: 400;">New Creative Submitted</h2>
            <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
              <p><strong>Brand:</strong> ${sponsorLabel}</p>
              <p><strong>Headline:</strong> ${headline}</p>
              ${body ? `<p><strong>Body:</strong> ${body}</p>` : ''}
              <p><strong>Click URL:</strong> <a href="${clickUrl}">${clickUrl}</a></p>
              <p><strong>Neighborhood:</strong> ${neighborhoodName || 'N/A'}</p>
              <p><strong>Date:</strong> ${ad.start_date || 'N/A'}</p>
              <p><strong>Customer:</strong> ${ad.customer_email || 'N/A'}</p>
            </div>
            <p>AI quality check is running. Review and approve in the dashboard.</p>
            <a href="${appUrl}/admin/ads" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px; display: inline-block;">
              Review in Dashboard
            </a>
          </div>
        `,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
