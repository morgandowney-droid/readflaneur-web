import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

/**
 * Passionfroot Webhook — Intake Funnel
 *
 * When a brand books a product on Passionfroot, this webhook creates
 * a pending_review ad in the ads table. The admin then reviews,
 * fills in creative details, and approves to go live.
 *
 * Auth: PASSIONFROOT_WEBHOOK_SECRET in Authorization header.
 * Idempotency: passionfroot_order_id unique index prevents duplicates.
 */

export async function POST(request: NextRequest) {
  try {
    // ─── Auth ───
    const secret = process.env.PASSIONFROOT_WEBHOOK_SECRET;
    if (secret) {
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json();

    // ─── Extract order data ───
    // Passionfroot webhook format is not fully documented.
    // We accept a flexible shape and extract what we can.
    const orderId = body.id || body.order_id || body.collaboration_id || body.data?.id;
    const clientName = body.client_name || body.partner_name || body.data?.partner?.name || body.brand_name || 'Unknown Client';
    const clientEmail = body.client_email || body.partner_email || body.data?.partner?.email || body.brand_email || '';
    const productName = body.product_name || body.package_name || body.data?.package?.name || body.data?.product?.name || '';
    const amount = body.amount || body.price || body.data?.price || 0;

    // Detect line items for design concierge upsell
    const lineItems: string[] = [];
    if (Array.isArray(body.line_items)) {
      body.line_items.forEach((item: { name?: string }) => {
        if (item.name) lineItems.push(item.name);
      });
    }
    if (Array.isArray(body.data?.line_items)) {
      body.data.line_items.forEach((item: { name?: string }) => {
        if (item.name) lineItems.push(item.name);
      });
    }
    // Also check product name and notes for design keywords
    const allText = [productName, ...lineItems, body.notes || '', body.data?.notes || ''].join(' ').toLowerCase();
    const needsDesign = allText.includes('design') ||
      allText.includes('concierge') ||
      allText.includes('creative service') ||
      allText.includes('creative production');

    // Detect Sunday Edition placement from product name or notes
    const isSundayEdition = allText.includes('sunday');

    if (!orderId) {
      return NextResponse.json({ error: 'Missing order ID' }, { status: 400 });
    }

    // ─── Create Supabase client ───
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ─── Insert ad (pending review) ───
    const { data: ad, error: insertError } = await supabase
      .from('ads')
      .insert({
        status: 'pending_review',
        placement: 'story_open',
        placement_type: isSundayEdition ? 'sunday_edition' : 'daily_brief',
        headline: '',
        image_url: '',
        click_url: '',
        sponsor_label: clientName,
        is_global: false,
        neighborhood_id: null,
        impressions: 0,
        clicks: 0,
        passionfroot_order_id: String(orderId),
        client_name: clientName,
        client_email: clientEmail,
        needs_design_service: needsDesign,
        admin_notes: `Passionfroot order. Product: ${productName || 'N/A'}. Amount: $${amount}. ${needsDesign ? 'Design concierge requested.' : ''}`.trim(),
      })
      .select('id')
      .single();

    if (insertError) {
      // Duplicate order (idempotency)
      if (insertError.code === '23505') {
        return NextResponse.json({ success: true, message: 'Order already processed' });
      }
      console.error('Passionfroot webhook insert error:', insertError);
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }

    // ─── Notify admin ───
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';

      await sendEmail({
        to: adminEmail,
        subject: `ACTION REQUIRED: New Ad Booking${needsDesign ? ' [Design Concierge]' : ''} — ${clientName}`,
        html: `
          <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLANEUR</h1>
            <h2 style="font-weight: 400;">New Passionfroot Booking</h2>

            <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
              <p><strong>Client:</strong> ${clientName}</p>
              <p><strong>Email:</strong> ${clientEmail || 'Not provided'}</p>
              <p><strong>Product:</strong> ${productName || 'N/A'}</p>
              <p><strong>Amount:</strong> $${amount}</p>
              ${needsDesign ? '<p style="color: #d97706; font-weight: bold;">Design Concierge Requested</p>' : ''}
            </div>

            <p style="color: #666;">Creative details pending — the client will provide via Passionfroot messaging or email.</p>

            <div style="margin: 30px 0;">
              <a href="${appUrl}/admin/ads" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px;">
                Review in Dashboard
              </a>
            </div>
          </div>
        `,
      });
    }

    // Fire-and-forget AI quality check (only if creative content present)
    if (ad?.id) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
      fetch(`${appUrl}/api/ads/quality`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({ adId: ad.id }),
      }).catch((err) => console.error('Fire-and-forget quality check failed:', err));
    }

    return NextResponse.json({
      success: true,
      adId: ad?.id,
      needsDesign,
    });
  } catch (error) {
    console.error('Passionfroot webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
