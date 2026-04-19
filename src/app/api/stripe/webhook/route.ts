import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import Stripe from 'stripe';

/**
 * @swagger
 * /api/stripe/webhook:
 *   post:
 *     summary: Handle Stripe webhook events
 *     description: Receives Stripe webhook events (checkout.session.completed, payment_intent.payment_failed). Verified via Stripe signature.
 *     tags: [Ads]
 *     parameters:
 *       - in: header
 *         name: stripe-signature
 *         required: true
 *         schema:
 *           type: string
 *         description: Stripe webhook signature
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook received
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Missing signature or verification failed
 */
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
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (webhookSecret) {
      event = getStripe().webhooks.constructEvent(
        body,
        signature,
        webhookSecret
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

      // ─── Partner subscription flow ───
      if (session.metadata?.type === 'partner' && session.metadata?.agent_partner_id) {
        const partnerId = session.metadata.agent_partner_id;
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : (session.subscription as Stripe.Subscription)?.id;

        const { error: partnerError } = await supabaseAdmin
          .from('agent_partners')
          .update({
            status: 'active',
            activated_at: new Date().toISOString(),
            stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
            stripe_subscription_id: subscriptionId || null,
          })
          .eq('id', partnerId);

        if (partnerError) {
          console.error(`Partner webhook: failed to activate ${partnerId}:`, partnerError);
        } else {
          console.log(`Partner ${partnerId} activated via Stripe subscription ${subscriptionId}`);

          // Fetch full partner record for both admin notification and broker welcome
          const { data: partnerData } = await supabaseAdmin
            .from('agent_partners')
            .select('agent_name, agent_email, agent_slug, neighborhood_id')
            .eq('id', partnerId)
            .single();

          // Look up neighborhood display name + timezone for welcome email
          const { data: neighborhoodData } = partnerData
            ? await supabaseAdmin
                .from('neighborhoods')
                .select('name, city, timezone')
                .eq('id', partnerData.neighborhood_id)
                .single()
            : { data: null };

          // Notify admin
          const adminEmail = process.env.ADMIN_EMAIL;
          if (adminEmail && partnerData) {
            await sendEmail({
              to: adminEmail,
              subject: `New Agent Partner: ${partnerData.agent_name} - ${partnerData.neighborhood_id}`,
              html: `
                <div style="font-family: system-ui, sans-serif; max-width: 600px;">
                  <h2>New Agent Partner Activated</h2>
                  <p><strong>Agent:</strong> ${partnerData.agent_name}</p>
                  <p><strong>Email:</strong> ${partnerData.agent_email}</p>
                  <p><strong>Neighborhood:</strong> ${partnerData.neighborhood_id}</p>
                  <p><strong>Revenue:</strong> $999/month (14-day trial first)</p>
                </div>
              `,
            });
          }

          // Welcome email to the broker
          if (partnerData) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/[\n\r]+$/, '').replace(/\/$/, '')
              || 'https://readflaneur.com';
            const neighborhoodLabel = neighborhoodData
              ? `${neighborhoodData.name}, ${neighborhoodData.city}`
              : partnerData.neighborhood_id;
            const subscribeUrl = `${appUrl}/r/${partnerData.agent_slug}`;
            const dashboardUrl = `${appUrl}/partner/dashboard`;

            // Trial end: 14 days from now
            const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
            const trialEndLabel = trialEnd.toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            });

            await sendEmail({
              to: partnerData.agent_email,
              subject: `Welcome to Flaneur - your ${neighborhoodLabel} newsletter starts tomorrow`,
              html: `
                <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; color: #1c1917; line-height: 1.6;">
                  <p style="font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: #78716c; margin: 0 0 24px;">Welcome to Flaneur</p>

                  <h1 style="font-size: 28px; font-weight: 300; margin: 0 0 16px;">Your ${neighborhoodLabel} newsletter is live</h1>

                  <p>${partnerData.agent_name},</p>

                  <p>You're now the exclusive Flaneur partner for <strong>${neighborhoodLabel}</strong>. Here's what happens next:</p>

                  <div style="margin: 32px 0; padding: 24px; background: #fafaf9; border-left: 3px solid #b45309;">
                    <p style="margin: 0 0 8px; font-weight: 600;">Your first branded Daily Brief goes out tomorrow at 7 AM local time.</p>
                    <p style="margin: 0; color: #57534e; font-size: 15px;">Every client you've added (and any you add later) will receive it. You'll receive a copy too - so you see exactly what they see.</p>
                  </div>

                  <h3 style="font-size: 18px; margin: 32px 0 12px;">What you'll get</h3>
                  <ul style="padding-left: 20px; color: #44403c;">
                    <li style="margin-bottom: 8px;"><strong>A daily copy of your own newsletter</strong>, delivered to ${partnerData.agent_email} every morning. This is the same email your clients receive.</li>
                    <li style="margin-bottom: 8px;"><strong>Weekly performance report</strong>, delivered every Monday: subscribers added, opens, clicks, and listing impressions from the week.</li>
                    <li style="margin-bottom: 8px;"><strong>14-day free trial.</strong> Your card isn't charged until ${trialEndLabel}. Cancel anytime before then at no cost.</li>
                  </ul>

                  <h3 style="font-size: 18px; margin: 32px 0 12px;">Share your newsletter</h3>
                  <p>Send this link to past clients, prospects, and sphere-of-influence to add them to your list:</p>
                  <p style="word-break: break-all; font-family: monospace; background: #fafaf9; padding: 12px; border-radius: 4px; font-size: 14px;"><a href="${subscribeUrl}" style="color: #b45309;">${subscribeUrl}</a></p>

                  <h3 style="font-size: 18px; margin: 32px 0 12px;">Manage your account</h3>
                  <p>Add clients, update your listings, change your photo, or pause sends from your dashboard:</p>
                  <p><a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background: #1c1917; color: #fafaf9; text-decoration: none; border-radius: 4px; font-size: 14px; letter-spacing: 0.05em; text-transform: uppercase;">Open Dashboard</a></p>

                  <p style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #e7e5e4; color: #78716c; font-size: 14px;">Questions? Just reply to this email - it reaches Morgan Downey, who built Flaneur.</p>
                </div>
              `,
            });
          }
        }
        break;
      }

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

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;

      // Check if this is a partner subscription
      const { data: partnerBySub } = await supabaseAdmin
        .from('agent_partners')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .single();

      if (partnerBySub) {
        await supabaseAdmin
          .from('agent_partners')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
          })
          .eq('id', partnerBySub.id);

        console.log(`Partner ${partnerBySub.id} subscription cancelled`);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const updatedSub = event.data.object as Stripe.Subscription;

      // Check if this is a partner subscription with payment failure
      const { data: partnerByUpdatedSub } = await supabaseAdmin
        .from('agent_partners')
        .select('id')
        .eq('stripe_subscription_id', updatedSub.id)
        .single();

      if (partnerByUpdatedSub) {
        if (updatedSub.status === 'past_due' || updatedSub.status === 'unpaid') {
          await supabaseAdmin
            .from('agent_partners')
            .update({ status: 'paused' })
            .eq('id', partnerByUpdatedSub.id);

          console.log(`Partner ${partnerByUpdatedSub.id} paused due to payment failure`);
        } else if (updatedSub.status === 'active') {
          // Payment recovered
          await supabaseAdmin
            .from('agent_partners')
            .update({ status: 'active' })
            .eq('id', partnerByUpdatedSub.id);

          console.log(`Partner ${partnerByUpdatedSub.id} reactivated`);
        }
      }
      break;
    }

    case 'invoice.upcoming': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = typeof invoice.subscription === 'string'
        ? invoice.subscription
        : (invoice.subscription as Stripe.Subscription | null)?.id;
      if (!subscriptionId) break;

      const { data: partner } = await supabaseAdmin
        .from('agent_partners')
        .select('id, agent_name, agent_email, neighborhood_id')
        .eq('stripe_subscription_id', subscriptionId)
        .single();
      if (!partner) break;

      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        const dueDate = invoice.next_payment_attempt
          ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            })
          : 'soon';
        const amount = invoice.amount_due ? `$${(invoice.amount_due / 100).toFixed(2)}` : '$999.00';
        await sendEmail({
          to: adminEmail,
          subject: `Upcoming renewal: ${partner.agent_name} (${partner.neighborhood_id}) - ${dueDate}`,
          html: `
            <div style="font-family: system-ui, sans-serif; max-width: 600px;">
              <h2>Partner renewal upcoming</h2>
              <p><strong>Agent:</strong> ${partner.agent_name} (${partner.agent_email})</p>
              <p><strong>Neighborhood:</strong> ${partner.neighborhood_id}</p>
              <p><strong>Amount:</strong> ${amount}</p>
              <p><strong>Attempt date:</strong> ${dueDate}</p>
              <p>Stripe will attempt the charge on the date above. If payment fails, Smart Retries runs for ~3 weeks before cancellation. Use this window to confirm retention or queue a replacement broker.</p>
            </div>
          `,
        });
      }
      console.log(`Upcoming renewal notified for partner ${partner.id}`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = typeof invoice.subscription === 'string'
        ? invoice.subscription
        : (invoice.subscription as Stripe.Subscription | null)?.id;
      if (!subscriptionId) break;

      const { data: partner } = await supabaseAdmin
        .from('agent_partners')
        .select('id, agent_name, agent_email, neighborhood_id')
        .eq('stripe_subscription_id', subscriptionId)
        .single();
      if (!partner) break;

      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await sendEmail({
          to: adminEmail,
          subject: `ACTION NEEDED: payment failed - ${partner.agent_name} (${partner.neighborhood_id})`,
          html: `
            <div style="font-family: system-ui, sans-serif; max-width: 600px;">
              <h2 style="color: #b91c1c;">Partner payment failed</h2>
              <p><strong>Agent:</strong> ${partner.agent_name} (${partner.agent_email})</p>
              <p><strong>Neighborhood:</strong> ${partner.neighborhood_id}</p>
              <p><strong>Status:</strong> sends have been auto-paused. Stripe Smart Retries runs for ~3 weeks before cancellation.</p>
              <p>Reach out to the broker if this is a high-value account, or start outreach to a replacement agent for this neighborhood.</p>
            </div>
          `,
        });
      }
      console.log(`Payment failed logged for partner ${partner.id}`);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
