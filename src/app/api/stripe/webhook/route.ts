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

      // ─── New booking flow (ad_ids or ad_id in metadata, no order_id) ───
      if ((session.metadata?.ad_ids || session.metadata?.ad_id) && !session.metadata?.order_id) {
        // Support multi-neighborhood: ad_ids is comma-separated, fall back to single ad_id
        const adIds = session.metadata.ad_ids
          ? session.metadata.ad_ids.split(',')
          : [session.metadata.ad_id!];

        // Update all ads to pending_assets
        const { error: updateError } = await supabaseAdmin
          .from('ads')
          .update({ status: 'pending_assets' })
          .in('id', adIds)
          .eq('status', 'pending_payment');

        if (updateError) {
          console.error(`Booking webhook: failed to update ads ${adIds.join(',')}:`, updateError);
          break;
        }

        // Get ad details for email
        const { data: ads } = await supabaseAdmin
          .from('ads')
          .select('id, customer_email, neighborhood_id, start_date, placement_type')
          .in('id', adIds);

        const customerEmail = ads?.[0]?.customer_email;
        if (customerEmail && ads && ads.length > 0) {
          // Look up neighborhood names
          const hoodIds = [...new Set(ads.map((a) => a.neighborhood_id).filter(Boolean))];
          const { data: hoods } = await supabaseAdmin
            .from('neighborhoods')
            .select('id, name, city')
            .in('id', hoodIds);

          const hoodMap = new Map((hoods || []).map((h) => [h.id, h]));

          const firstAd = ads[0];
          const displayDate = firstAd.start_date
            ? new Date(firstAd.start_date + 'T00:00:00Z').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
              })
            : 'your booked date';

          const placementLabel = firstAd.placement_type === 'sunday_edition'
            ? 'Sunday Edition'
            : 'Daily Brief';

          const amountPaid = session.amount_total
            ? `$${(session.amount_total / 100).toFixed(0)}`
            : '';

          const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/[\n\r]+$/, '').replace(/\/$/, '')
            || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://readflaneur.com');

          // Build neighborhood list and upload links
          const neighborhoodList = ads.map((a) => {
            const hood = hoodMap.get(a.neighborhood_id);
            return hood ? `${hood.name}, ${hood.city}` : a.neighborhood_id;
          });

          const uploadLinks = ads.map((a) => {
            const hood = hoodMap.get(a.neighborhood_id);
            const label = hood ? hood.name : a.neighborhood_id;
            return `<a href="${appUrl}/advertise/upload/${a.id}" style="color: #1a1a1a; text-decoration: underline;">${label}</a>`;
          });

          const neighborhoodSummary = neighborhoodList.join(', ');
          const subject = ads.length === 1
            ? `Your Flâneur booking is confirmed — ${neighborhoodList[0]}, ${displayDate}`
            : `Your Flâneur booking is confirmed — ${ads.length} neighborhoods, ${displayDate}`;

          // Send confirmation email to customer
          await sendEmail({
            to: customerEmail,
            subject,
            html: `
              <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
                <h1 style="font-weight: 300; letter-spacing: 0.1em; font-size: 24px; margin-bottom: 8px;">FLÂNEUR</h1>
                <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 16px 0;" />

                <h2 style="font-weight: 400; font-size: 20px;">Booking Confirmed</h2>

                <div style="background: #fafafa; padding: 20px; margin: 20px 0; border-left: 3px solid #1a1a1a;">
                  <p style="margin: 4px 0;"><strong>${ads.length > 1 ? 'Neighborhoods' : 'Neighborhood'}:</strong> ${neighborhoodSummary}</p>
                  <p style="margin: 4px 0;"><strong>Date:</strong> ${displayDate}</p>
                  <p style="margin: 4px 0;"><strong>Placement:</strong> ${placementLabel}</p>
                  ${amountPaid ? `<p style="margin: 4px 0;"><strong>Amount:</strong> ${amountPaid}</p>` : ''}
                </div>

                <p style="font-size: 15px; line-height: 1.6;">
                  Payment received. Next step: upload your ad creative for each neighborhood.
                  Our editorial team will review it and notify you when your ads are live.
                </p>

                <div style="margin: 30px 0;">
                  ${ads.length === 1
                    ? `<a href="${appUrl}/advertise/upload/${ads[0].id}" style="background: #1a1a1a; color: #fff; padding: 14px 28px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 13px; display: inline-block;">Upload Your Creative</a>`
                    : `<p style="font-size: 15px; font-weight: 500; margin-bottom: 12px;">Upload links:</p>${uploadLinks.map((link) => `<p style="margin: 8px 0; font-size: 15px;">→ ${link}</p>`).join('')}`
                  }
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
              subject: `New Ad Booking: ${neighborhoodSummary} — ${displayDate} (${placementLabel})`,
              html: `
                <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px;">
                  <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLÂNEUR</h1>
                  <h2 style="font-weight: 400;">New Booking Received</h2>
                  <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
                    <p><strong>Customer:</strong> ${customerEmail}</p>
                    <p><strong>Neighborhoods:</strong> ${neighborhoodSummary}</p>
                    <p><strong>Date:</strong> ${displayDate}</p>
                    <p><strong>Placement:</strong> ${placementLabel}</p>
                    <p><strong>Ads:</strong> ${ads.length}</p>
                    ${amountPaid ? `<p><strong>Amount:</strong> ${amountPaid}</p>` : ''}
                  </div>
                  <p>The customer has been sent upload links. Creative will go through AI quality check on submission.</p>
                  <a href="${appUrl}/admin/ads" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px; display: inline-block;">
                    View in Dashboard
                  </a>
                </div>
              `,
            });
          }
        }

        console.log(`Booking completed: ${adIds.length} ads → pending_assets`);
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
