import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

/**
 * Resend Inbound Email Webhook
 *
 * Receives inbound emails. The Passionfroot booking flow has been replaced
 * by native Stripe Checkout booking — this endpoint now only logs
 * unexpected inbound emails for debugging.
 */

export async function POST(request: NextRequest) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const rawBody = await request.text();

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
      event = resend.webhooks.verify({
        payload: rawBody,
        headers: {
          id: svixId,
          timestamp: svixTimestamp,
          signature: svixSignature,
        },
        webhookSecret,
      });
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Only process email.received events
    if (event.type !== 'email.received') {
      return NextResponse.json({ success: true, message: `Ignoring ${event.type}` });
    }

    const data = event.data as {
      email_id: string;
      subject: string;
      from: string;
    };

    console.log(`Resend inbound: received email "${data.subject}" from ${data.from} — no handler configured`);

    return NextResponse.json({ success: true, message: 'Logged' });
  } catch (error) {
    console.error('Resend inbound webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
