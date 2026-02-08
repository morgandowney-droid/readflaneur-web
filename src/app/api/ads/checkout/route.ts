import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getBookingPrice } from '@/lib/PricingService';

const BOOKING_LEAD_HOURS = 48;
const BOOKING_MAX_DAYS = 90;

/**
 * POST /api/ads/checkout
 *
 * Creates a Stripe Checkout Session for an ad booking.
 * No auth required (public checkout).
 *
 * Body:
 *   date            - YYYY-MM-DD
 *   neighborhoodId  - neighborhood slug
 *   placementType   - 'daily_brief' | 'sunday_edition'
 *   customerEmail   - buyer's email
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, neighborhoodId, placementType, customerEmail } = body;

    // ─── Validate inputs ───
    if (!date || !neighborhoodId || !placementType || !customerEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: date, neighborhoodId, placementType, customerEmail' },
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

    // ─── Validate neighborhood exists ───
    const { data: neighborhood } = await supabase
      .from('neighborhoods')
      .select('id, name, city')
      .eq('id', neighborhoodId)
      .single();

    if (!neighborhood) {
      return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
    }

    // ─── Race condition check ───
    // Check for existing booking on this date + neighborhood + type
    const { data: existingBooking } = await supabase
      .from('ads')
      .select('id')
      .eq('neighborhood_id', neighborhoodId)
      .eq('placement_type', placementType)
      .eq('start_date', date)
      .not('status', 'in', '("rejected","pending_payment")')
      .limit(1)
      .single();

    if (existingBooking) {
      return NextResponse.json(
        { error: 'This date is already booked for this neighborhood' },
        { status: 409 }
      );
    }

    // Also check for global takeover on this date
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

    // ─── Compute price server-side ───
    const pricing = getBookingPrice(neighborhoodId, placementType, bookingDate);

    // ─── Insert ad row with pending_payment status ───
    const { data: ad, error: insertError } = await supabase
      .from('ads')
      .insert({
        status: 'pending_payment',
        placement: 'story_open',
        placement_type: placementType,
        headline: '',
        image_url: '',
        click_url: '',
        sponsor_label: '',
        is_global: false,
        is_global_takeover: false,
        neighborhood_id: neighborhoodId,
        start_date: date,
        end_date: date,
        customer_email: customerEmail,
        impressions: 0,
        clicks: 0,
      })
      .select('id')
      .single();

    if (insertError) {
      // Unique constraint violation = double booking
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'This date is already booked' },
          { status: 409 }
        );
      }
      console.error('Checkout insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }

    // ─── Create Stripe Checkout Session ───
    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const displayName = placementType === 'sunday_edition' ? 'Sunday Edition' : 'Daily Brief';
    const formattedDate = bookingDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      typescript: true,
      maxNetworkRetries: 3,
      timeout: 20000,
    });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Flâneur — ${neighborhood.name}, ${neighborhood.city} — ${formattedDate}`,
              description: `${displayName} placement`,
            },
            unit_amount: pricing.priceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        ad_id: ad.id,
        neighborhood_id: neighborhoodId,
        placement_type: placementType,
        date,
      },
      success_url: `${origin}/advertise/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/advertise`,
    });

    // Update ad row with stripe session ID
    await supabase
      .from('ads')
      .update({ stripe_session_id: session.id })
      .eq('id', ad.id);

    return NextResponse.json({
      url: session.url,
      adId: ad.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Checkout error:', message, error);
    return NextResponse.json({ error: 'Internal error', details: message }, { status: 500 });
  }
}
