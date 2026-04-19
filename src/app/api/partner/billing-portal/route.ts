import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/stripe';

/**
 * Create a Stripe Billing Portal session for the authenticated broker.
 *
 * Stripe hosts the UI for: cancel subscription, update payment method, view
 * invoices, download receipts. We just redirect the broker to the portal and
 * back to their dashboard.
 *
 * The `customer.subscription.deleted` webhook handles cleanup — partner row
 * stays in the DB (setup/listings/client emails preserved), status flips to
 * `cancelled`, neighborhood unique-index lock releases for a replacement broker.
 */

function getPartnerId(request: NextRequest): string | null {
  return request.cookies.get('flaneur-partner-session')?.value || null;
}

export async function POST(request: NextRequest) {
  try {
    const partnerId = getPartnerId(request);
    if (!partnerId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: partner } = await supabaseAdmin
      .from('agent_partners')
      .select('id, stripe_customer_id, status')
      .eq('id', partnerId)
      .single();

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    if (!partner.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account on file yet. Complete checkout first.' },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/[\n\r]+$/, '').replace(/\/$/, '')
      || 'https://readflaneur.com';

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: partner.stripe_customer_id,
      return_url: `${appUrl}/partner/dashboard`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Partner billing portal error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
