import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { parsePassionfrootEmail } from '@/lib/passionfroot-email-parser';

/**
 * Resend Inbound Email Webhook — Passionfroot Fallback
 *
 * When Passionfroot doesn't offer native webhooks, this endpoint
 * receives booking notification emails forwarded via:
 *   Passionfroot → Gmail → Resend Inbound → this webhook
 *
 * Auth: Svix signature verification via RESEND_WEBHOOK_SECRET.
 * Idempotency: passionfroot_order_id = 'email-{resend_email_id}'.
 */

export async function POST(request: NextRequest) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    // ─── Read raw body for signature verification ───
    const rawBody = await request.text();

    let email_id: string;
    let subject: string;
    let from: string;

    // ─── Test mode: bypass signature, accept email_id directly ───
    const testSecret = request.headers.get('x-test-secret');
    if (testSecret && testSecret === process.env.CRON_SECRET) {
      const body = JSON.parse(rawBody);
      email_id = body.email_id;
      subject = body.subject || '';
      from = body.from || '';
    } else {
      // ─── Verify webhook signature (Svix) ───
      const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error('RESEND_WEBHOOK_SECRET not configured');
        return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
      }

      const svixId = request.headers.get('svix-id');
      const svixTimestamp = request.headers.get('svix-timestamp');
      const svixSignature = request.headers.get('svix-signature');

      if (!svixId || !svixTimestamp || !svixSignature) {
        return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
      }

      let event;
      try {
        event = resend.webhooks.verify(
          {
            payload: rawBody,
            headers: {
              id: svixId,
              timestamp: svixTimestamp,
              signature: svixSignature,
            },
            webhookSecret,
          }
        );
      } catch (err) {
        console.error('Webhook signature verification failed:', err);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
      }

      // ─── Only process email.received events ───
      if (event.type !== 'email.received') {
        return NextResponse.json({ success: true, message: `Ignoring ${event.type}` });
      }

      const data = event.data as {
        email_id: string;
        subject: string;
        from: string;
        to: string[];
        message_id: string;
      };
      email_id = data.email_id;
      subject = data.subject;
      from = data.from;
    }

    // ─── Quick subject filter ───
    const subjectLower = subject.toLowerCase();
    const isPassionfroot =
      subjectLower.includes('booking') ||
      subjectLower.includes('collaboration') ||
      subjectLower.includes('passionfroot') ||
      subjectLower.includes('new order');

    if (!isPassionfroot) {
      console.log(`Resend inbound: ignoring non-Passionfroot email "${subject}" from ${from}`);
      return NextResponse.json({ success: true, message: 'Not a Passionfroot booking' });
    }

    // ─── Fetch full email content ───
    const { data: email, error: fetchError } = await resend.emails.receiving.get(email_id);

    if (fetchError || !email) {
      console.error('Failed to fetch email content:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch email' }, { status: 500 });
    }

    // ─── Parse booking data ───
    const booking = parsePassionfrootEmail(email.subject, email.html, email.text);

    if (!booking) {
      console.log(`Resend inbound: could not parse booking from "${email.subject}"`);
      // Return 200 so Resend doesn't retry unparseable emails
      return NextResponse.json({ success: true, message: 'Could not parse booking' });
    }

    // ─── Insert ad (pending review) ───
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: ad, error: insertError } = await supabase
      .from('ads')
      .insert({
        status: 'pending_review',
        placement: 'story_open',
        headline: '',
        image_url: '',
        click_url: '',
        sponsor_label: booking.clientName,
        is_global: false,
        neighborhood_id: null,
        impressions: 0,
        clicks: 0,
        passionfroot_order_id: `email-${email_id}`,
        client_name: booking.clientName,
        client_email: booking.clientEmail,
        needs_design_service: booking.needsDesign,
        admin_notes: `Passionfroot order (via email fallback). Product: ${booking.productName || 'N/A'}. Amount: $${booking.amount}. ${booking.needsDesign ? 'Design concierge requested.' : ''}`.trim(),
      })
      .select('id')
      .single();

    if (insertError) {
      // Duplicate (idempotency)
      if (insertError.code === '23505') {
        return NextResponse.json({ success: true, message: 'Already processed' });
      }
      console.error('Resend inbound insert error:', insertError);
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }

    // ─── Notify admin ───
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';

      await sendEmail({
        to: adminEmail,
        subject: `ACTION REQUIRED: New Ad Booking (Email Fallback)${booking.needsDesign ? ' [Design Concierge]' : ''} — ${booking.clientName}`,
        html: `
          <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLANEUR</h1>
            <h2 style="font-weight: 400;">New Passionfroot Booking (Email Fallback)</h2>

            <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
              <p><strong>Client:</strong> ${booking.clientName}</p>
              <p><strong>Email:</strong> ${booking.clientEmail || 'Not provided'}</p>
              <p><strong>Product:</strong> ${booking.productName || 'N/A'}</p>
              <p><strong>Amount:</strong> $${booking.amount}</p>
              ${booking.needsDesign ? '<p style="color: #d97706; font-weight: bold;">Design Concierge Requested</p>' : ''}
            </div>

            <p style="color: #999; font-size: 12px;">
              This booking was detected via email parsing (not Passionfroot webhook).
              Original email from: ${from}, subject: "${subject}"
            </p>

            <div style="margin: 30px 0;">
              <a href="${appUrl}/admin/ads" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px;">
                Review in Dashboard
              </a>
            </div>
          </div>
        `,
      });
    }

    return NextResponse.json({
      success: true,
      adId: ad?.id,
      source: 'email_fallback',
      needsDesign: booking.needsDesign,
    });
  } catch (error) {
    console.error('Resend inbound webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
