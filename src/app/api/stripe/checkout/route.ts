import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { adId, packageId } = body;

    if (!adId || !packageId) {
      return NextResponse.json(
        { error: 'Missing adId or packageId' },
        { status: 400 }
      );
    }

    // Fetch the ad package
    const { data: pkg, error: pkgError } = await supabase
      .from('ad_packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg) {
      return NextResponse.json(
        { error: 'Package not found' },
        { status: 404 }
      );
    }

    // Fetch the ad
    const { data: ad, error: adError } = await supabase
      .from('ads')
      .select('*')
      .eq('id', adId)
      .eq('advertiser_id', user.id)
      .single();

    if (adError || !ad) {
      return NextResponse.json(
        { error: 'Ad not found' },
        { status: 404 }
      );
    }

    // Create ad order record
    const { data: order, error: orderError } = await supabase
      .from('ad_orders')
      .insert({
        advertiser_id: user.id,
        ad_id: adId,
        package_id: packageId,
        amount_cents: pkg.price_cents,
        status: 'pending',
      })
      .select()
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Failed to create order' },
        { status: 500 }
      );
    }

    // Create Stripe Checkout session
    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Flâneur Ad: ${pkg.name}`,
              description: `${pkg.duration_days}-day ad campaign - ${ad.headline}`,
            },
            unit_amount: pkg.price_cents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/advertiser/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/advertiser/ads/${adId}`,
      metadata: {
        order_id: order.id,
        ad_id: adId,
        package_id: packageId,
        user_id: user.id,
      },
    });

    // Update order with Stripe session ID
    await supabase
      .from('ad_orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.id);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
