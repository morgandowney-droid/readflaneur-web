import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

/**
 * Resend Events Webhook - hard-bounce + spam-complaint handling.
 *
 * On a hard bounce or spam complaint, disables daily email delivery for the
 * affected address (newsletter_subscribers + profiles) so we stop sending to
 * dead or hostile inboxes. This protects sender reputation - important now
 * that newsletter signup is single opt-in (a typo'd address gets a real send).
 *
 * SETUP: register this endpoint (`/api/webhooks/resend`) in the Resend
 * dashboard for the `email.bounced` and `email.complained` events.
 *
 * @swagger
 * /api/webhooks/resend:
 *   post:
 *     summary: Handle Resend bounce/complaint events
 *     description: Verified via Svix signature. Disables delivery for bounced or complained addresses.
 *     tags: [Internal]
 *     responses:
 *       200:
 *         description: Event processed
 *       400:
 *         description: Missing or invalid signature
 *       500:
 *         description: Server misconfigured
 */
export async function POST(request: NextRequest) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const rawBody = await request.text();

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
      event = resend.webhooks.verify({
        payload: rawBody,
        headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
        webhookSecret,
      });
    } catch (err) {
      console.error('Resend webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Only act on hard bounces and spam complaints.
    if (event.type !== 'email.bounced' && event.type !== 'email.complained') {
      return NextResponse.json({ success: true, message: `Ignoring ${event.type}` });
    }

    const data = event.data as { to?: string | string[] };
    const recipients = Array.isArray(data.to) ? data.to : data.to ? [data.to] : [];
    const emails = recipients
      .map((e) => (typeof e === 'string' ? e.toLowerCase().trim() : ''))
      .filter(Boolean);

    if (emails.length === 0) {
      return NextResponse.json({ success: true, message: 'No recipient on event' });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Disable delivery across both recipient sources.
    await supabase
      .from('newsletter_subscribers')
      .update({ daily_email_enabled: false })
      .in('email', emails);
    await supabase
      .from('profiles')
      .update({ daily_email_enabled: false })
      .in('email', emails);

    console.log(`Resend ${event.type}: disabled delivery for ${emails.join(', ')}`);
    return NextResponse.json({ success: true, message: `Disabled ${emails.length} address(es)` });
  } catch (error) {
    console.error('Resend events webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
