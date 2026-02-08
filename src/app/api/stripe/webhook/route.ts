import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
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
      // Log warning if webhook secret is missing in production
      console.warn('STRIPE_WEBHOOK_SECRET not configured - skipping signature verification');
      event = JSON.parse(body) as Stripe.Event;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature verification failed:', errorMessage);
    return NextResponse.json({
      error: 'Invalid signature',
      details: errorMessage
    }, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;

      // ─── New booking flow (ad_id in metadata, no order_id) ───
      if (session.metadata?.ad_id && !session.metadata?.order_id) {
        const adId = session.metadata.ad_id;

        // Update ad status to pending_assets
        const { error: updateError } = await supabaseAdmin
          .from('ads')
          .update({ status: 'pending_assets' })
          .eq('id', adId)
          .eq('status', 'pending_payment');

        if (updateError) {
          console.error(`Booking webhook: failed to update ad ${adId}:`, updateError);
          break;
        }

        // Get ad details for email
        const { data: ad } = await supabaseAdmin
          .from('ads')
          .select('customer_email, neighborhood_id, start_date, placement_type')
          .eq('id', adId)
          .single();

        if (ad?.customer_email) {
          // Look up neighborhood name
          let neighborhoodName = 'your neighborhood';
          let cityName = '';
          if (ad.neighborhood_id) {
            const { data: hood } = await supabaseAdmin
              .from('neighborhoods')
              .select('name, city')
              .eq('id', ad.neighborhood_id)
              .single();
            if (hood) {
              neighborhoodName = hood.name;
              cityName = hood.city;
            }
          }

          const displayDate = ad.start_date
            ? new Date(ad.start_date + 'T00:00:00Z').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
              })
            : 'your booked date';

          const placementLabel = ad.placement_type === 'sunday_edition'
            ? 'Sunday Edition'
            : 'Daily Brief';

          const amountPaid = session.amount_total
            ? `$${(session.amount_total / 100).toFixed(0)}`
            : '';

          const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
            || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://readflaneur.com');

          const uploadUrl = `${appUrl}/advertise/upload/${adId}`;

          // Send confirmation email to customer
          await sendEmail({
            to: ad.customer_email,
            subject: `Your Flâneur booking is confirmed — ${neighborhoodName}${cityName ? `, ${cityName}` : ''}, ${displayDate}`,
            html: `
              <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
                <h1 style="font-weight: 300; letter-spacing: 0.1em; font-size: 24px; margin-bottom: 8px;">FLÂNEUR</h1>
                <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 16px 0;" />

                <h2 style="font-weight: 400; font-size: 20px;">Booking Confirmed</h2>

                <div style="background: #fafafa; padding: 20px; margin: 20px 0; border-left: 3px solid #1a1a1a;">
                  <p style="margin: 4px 0;"><strong>Neighborhood:</strong> ${neighborhoodName}${cityName ? `, ${cityName}` : ''}</p>
                  <p style="margin: 4px 0;"><strong>Date:</strong> ${displayDate}</p>
                  <p style="margin: 4px 0;"><strong>Placement:</strong> ${placementLabel}</p>
                  ${amountPaid ? `<p style="margin: 4px 0;"><strong>Amount:</strong> ${amountPaid}</p>` : ''}
                </div>

                <p style="font-size: 15px; line-height: 1.6;">
                  Payment received. Next step: upload your ad creative using the link below.
                  Our editorial team will review it and notify you when your ad is live.
                </p>

                <div style="margin: 30px 0;">
                  <a href="${uploadUrl}" style="background: #1a1a1a; color: #fff; padding: 14px 28px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 13px; display: inline-block;">
                    Upload Your Creative
                  </a>
                </div>

                <p style="font-size: 12px; color: #999;">
                  Questions? Reply to this email or contact <a href="mailto:ads@readflaneur.com" style="color: #666;">ads@readflaneur.com</a>
                </p>
              </div>
            `,
          });

          // Notify admin
          const adminEmail = process.env.ADMIN_EMAIL;
          if (adminEmail) {
            await sendEmail({
              to: adminEmail,
              subject: `New Ad Booking: ${neighborhoodName} — ${displayDate} (${placementLabel})`,
              html: `
                <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px;">
                  <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLÂNEUR</h1>
                  <h2 style="font-weight: 400;">New Booking Received</h2>
                  <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
                    <p><strong>Customer:</strong> ${ad.customer_email}</p>
                    <p><strong>Neighborhood:</strong> ${neighborhoodName}${cityName ? `, ${cityName}` : ''}</p>
                    <p><strong>Date:</strong> ${displayDate}</p>
                    <p><strong>Placement:</strong> ${placementLabel}</p>
                    ${amountPaid ? `<p><strong>Amount:</strong> ${amountPaid}</p>` : ''}
                  </div>
                  <p>The customer has been sent an upload link. Creative will go through AI quality check on submission.</p>
                  <a href="${appUrl}/admin/ads" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px; display: inline-block;">
                    View in Dashboard
                  </a>
                </div>
              `,
            });
          }
        }

        console.log(`Booking completed: ad ${adId} → pending_assets`);
        break;
      }

      // ─── Legacy flow (order_id in metadata) ───
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
