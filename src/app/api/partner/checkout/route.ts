import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/stripe';

const PARTNER_PRICE_CENTS = 99900; // $999.00

export async function POST(request: NextRequest) {
  try {
    const { agentPartnerId } = await request.json();

    if (!agentPartnerId) {
      return NextResponse.json({ error: 'Missing agentPartnerId' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch agent partner
    const { data: partner } = await supabaseAdmin
      .from('agent_partners')
      .select('id, agent_name, agent_email, neighborhood_id, status')
      .eq('id', agentPartnerId)
      .single();

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    if (partner.status === 'active') {
      return NextResponse.json({ error: 'Already active' }, { status: 400 });
    }

    // Fetch neighborhood name for display
    const { data: neighborhood } = await supabaseAdmin
      .from('neighborhoods')
      .select('name, city')
      .eq('id', partner.neighborhood_id)
      .single();

    const neighborhoodLabel = neighborhood
      ? `${neighborhood.name}, ${neighborhood.city}`
      : partner.neighborhood_id;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/[\n\r]+$/, '').replace(/\/$/, '')
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://readflaneur.com');

    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: partner.agent_email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            recurring: { interval: 'month' },
            unit_amount: PARTNER_PRICE_CENTS,
            product_data: {
              name: `Flaneur Partner - ${neighborhoodLabel}`,
              description: `Branded daily newsletter for ${neighborhoodLabel}. 14-day free trial, then $999/month. Cancel anytime.`,
            },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 14,
        trial_settings: {
          end_behavior: { missing_payment_method: 'cancel' },
        },
      },
      payment_method_collection: 'always',
      metadata: {
        type: 'partner',
        agent_partner_id: partner.id,
      },
      success_url: `${appUrl}/partner?activated=true`,
      cancel_url: `${appUrl}/partner`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Partner checkout error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
