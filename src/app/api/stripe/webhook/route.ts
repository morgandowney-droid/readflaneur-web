import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export async function POST(request: NextRequest) {
  // Create clients at runtime
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    // If webhook secret is configured, verify signature
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = getStripe().webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } else {
      // For development without webhook secret
      event = JSON.parse(body) as Stripe.Event;
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;

      const orderId = session.metadata?.order_id;
      const adId = session.metadata?.ad_id;
      const packageId = session.metadata?.package_id;

      if (!orderId || !adId) {
        console.error('Missing metadata in session');
        break;
      }

      // Get package duration
      const { data: pkg } = await supabaseAdmin
        .from('ad_packages')
        .select('duration_days')
        .eq('id', packageId)
        .single();

      const durationDays = pkg?.duration_days || 7;

      // Calculate start and end dates
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + durationDays);

      // Update order status
      await supabaseAdmin
        .from('ad_orders')
        .update({
          status: 'paid',
          stripe_payment_intent_id: session.payment_intent as string,
          paid_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      // Activate the ad
      await supabaseAdmin
        .from('ads')
        .update({
          status: 'active',
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
        })
        .eq('id', adId);

      console.log(`Order ${orderId} paid, ad ${adId} activated`);
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      // Find and update the order
      const { data: orders } = await supabaseAdmin
        .from('ad_orders')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntent.id);

      if (orders && orders.length > 0) {
        await supabaseAdmin
          .from('ad_orders')
          .update({ status: 'failed' })
          .eq('id', orders[0].id);
      }

      console.log(`Payment failed for intent ${paymentIntent.id}`);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
