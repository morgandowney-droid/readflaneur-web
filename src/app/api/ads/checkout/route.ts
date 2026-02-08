import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBookingPrice } from '@/lib/PricingService';

const BOOKING_LEAD_HOURS = 48;
const BOOKING_MAX_DAYS = 90;

/**
 * POST /api/ads/checkout
 *
 * Creates a Stripe Checkout Session for ad booking(s).
 * Supports single or multi-neighborhood bookings.
 *
 * Body:
 *   date            - YYYY-MM-DD
 *   neighborhoodId  - single neighborhood slug (legacy)
 *   neighborhoodIds - array of neighborhood slugs (multi)
 *   placementType   - 'daily_brief' | 'sunday_edition'
 *   customerEmail   - buyer's email
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, neighborhoodId, neighborhoodIds: rawIds, placementType, customerEmail } = body;

    // Support both single and multi-neighborhood
    const neighborhoodIds: string[] = rawIds || (neighborhoodId ? [neighborhoodId] : []);

    // ─── Validate inputs ───
    if (!date || neighborhoodIds.length === 0 || !placementType || !customerEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: date, neighborhoodIds, placementType, customerEmail' },
        { status: 400 }
      );
    }

    if (neighborhoodIds.length > 20) {
      return NextResponse.json(
        { error: 'Maximum 20 neighborhoods per booking' },
        { status: 400 }
      );
    }

    if (!['daily_brief', 'sunday_edition'].includes(placementType)) {
      return NextResponse.json(
        { error: 'placementType must be daily_brief or sunday_edition' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // Parse and validate date
    const bookingDate = new Date(date + 'T00:00:00Z');
    if (isNaN(bookingDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    // Validate booking horizon (48h–90d)
    const now = new Date();
    const minDate = new Date(now.getTime() + BOOKING_LEAD_HOURS * 60 * 60 * 1000);
    const maxDate = new Date(now.getTime() + BOOKING_MAX_DAYS * 24 * 60 * 60 * 1000);

    if (bookingDate < minDate) {
      return NextResponse.json(
        { error: 'Date must be at least 48 hours in the future' },
        { status: 400 }
      );
    }
    if (bookingDate > maxDate) {
      return NextResponse.json(
        { error: 'Date must be within 90 days from today' },
        { status: 400 }
      );
    }

    // Sunday Edition must be on a Sunday
    if (placementType === 'sunday_edition' && bookingDate.getUTCDay() !== 0) {
      return NextResponse.json(
        { error: 'Sunday Edition placements must be on a Sunday' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ─── Validate all neighborhoods exist ───
    const { data: neighborhoods } = await supabase
      .from('neighborhoods')
      .select('id, name, city')
      .in('id', neighborhoodIds);

    if (!neighborhoods || neighborhoods.length !== neighborhoodIds.length) {
      return NextResponse.json({ error: 'One or more neighborhoods not found' }, { status: 404 });
    }

    // ─── Race condition check: existing bookings ───
    const { data: existingBookings } = await supabase
      .from('ads')
      .select('id, neighborhood_id')
      .in('neighborhood_id', neighborhoodIds)
      .eq('placement_type', placementType)
      .eq('start_date', date)
      .not('status', 'in', '("rejected","pending_payment")');

    if (existingBookings && existingBookings.length > 0) {
      const bookedIds = existingBookings.map((b) => b.neighborhood_id);
      const bookedNames = neighborhoods
        .filter((n) => bookedIds.includes(n.id))
        .map((n) => n.name);
      return NextResponse.json(
        { error: `Already booked: ${bookedNames.join(', ')}` },
        { status: 409 }
      );
    }

    // Global takeover check
    const { data: globalBooking } = await supabase
      .from('ads')
      .select('id')
      .eq('is_global_takeover', true)
      .eq('placement_type', placementType)
      .eq('start_date', date)
      .not('status', 'in', '("rejected","pending_payment")')
      .limit(1)
      .single();

    if (globalBooking) {
      return NextResponse.json(
        { error: 'This date is blocked by a global takeover' },
        { status: 409 }
      );
    }

    // ─── Compute prices server-side ───
    const lineItems: { neighborhoodId: string; name: string; city: string; priceCents: number }[] = [];
    for (const nId of neighborhoodIds) {
      const n = neighborhoods.find((x) => x.id === nId)!;
      const pricing = getBookingPrice(nId, placementType, bookingDate);
      lineItems.push({
        neighborhoodId: nId,
        name: n.name,
        city: n.city,
        priceCents: pricing.priceCents,
      });
    }

    // ─── Insert ad rows (one per neighborhood) ───
    const adRows = lineItems.map((item) => ({
      status: 'pending_payment',
      placement: 'story_open',
      placement_type: placementType,
      headline: '',
      image_url: '',
      click_url: '',
      sponsor_label: '',
      is_global: false,
      is_global_takeover: false,
      neighborhood_id: item.neighborhoodId,
      start_date: date,
      end_date: date,
      customer_email: customerEmail,
      impressions: 0,
      clicks: 0,
    }));

    const { data: ads, error: insertError } = await supabase
      .from('ads')
      .insert(adRows)
      .select('id, neighborhood_id');

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'One or more dates are already booked' },
          { status: 409 }
        );
      }
      console.error('Checkout insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }

    const adIds = ads!.map((a) => a.id);

    // ─── Create Stripe Checkout Session ───
    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/[\n\r]+$/, '').replace(/\/$/, '')
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const displayName = placementType === 'sunday_edition' ? 'Sunday Edition' : 'Daily Brief';
    const formattedDate = bookingDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });

    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('customer_email', customerEmail);

    // One line item per neighborhood
    lineItems.forEach((item, i) => {
      const productName = `Flâneur — ${item.name}, ${item.city} — ${formattedDate}`;
      params.append(`line_items[${i}][price_data][currency]`, 'usd');
      params.append(`line_items[${i}][price_data][product_data][name]`, productName);
      params.append(`line_items[${i}][price_data][product_data][description]`, `${displayName} placement`);
      params.append(`line_items[${i}][price_data][unit_amount]`, String(item.priceCents));
      params.append(`line_items[${i}][quantity]`, '1');
    });

    // Metadata — ad_ids for webhook, plus legacy ad_id for single bookings
    params.append('metadata[ad_ids]', adIds.join(','));
    params.append('metadata[placement_type]', placementType);
    params.append('metadata[date]', date);
    if (adIds.length === 1) {
      params.append('metadata[ad_id]', adIds[0]);
    }

    params.append('success_url', `${origin}/advertise/success?session_id={CHECKOUT_SESSION_ID}`);
    params.append('cancel_url', `${origin}/advertise`);

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error('Stripe session creation failed:', session);
      // Clean up pending_payment rows
      await supabase.from('ads').delete().in('id', adIds);
      return NextResponse.json(
        { error: 'Payment setup failed', details: session.error?.message },
        { status: 502 }
      );
    }

    // Update all ad rows with stripe session ID
    await supabase
      .from('ads')
      .update({ stripe_session_id: session.id })
      .in('id', adIds);

    return NextResponse.json({
      url: session.url,
      adIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Checkout error:', message, error);
    return NextResponse.json({ error: 'Internal error', details: message }, { status: 500 });
  }
}
