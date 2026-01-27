import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;
    const { packageId } = await request.json();

    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user is admin (owner)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized for free ads' }, { status: 403 });
    }

    // Fetch the ad
    const { data: ad, error: adError } = await supabase
      .from('ads')
      .select('*')
      .eq('id', adId)
      .eq('advertiser_id', user.id)
      .single();

    if (adError || !ad) {
      return NextResponse.json({ error: 'Ad not found' }, { status: 404 });
    }

    if (ad.status !== 'approved') {
      return NextResponse.json({ error: 'Ad must be approved first' }, { status: 400 });
    }

    // Fetch package for duration
    const { data: pkg, error: pkgError } = await supabase
      .from('ad_packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    // Calculate dates
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + pkg.duration_days);

    // Create free order record
    const { error: orderError } = await supabase
      .from('ad_orders')
      .insert({
        advertiser_id: user.id,
        ad_id: adId,
        package_id: packageId,
        amount_cents: 0, // Free for owner
        status: 'paid',
        paid_at: now.toISOString(),
      });

    if (orderError) {
      console.error('Order error:', orderError);
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    // Activate the ad
    const { error: updateError } = await supabase
      .from('ads')
      .update({
        status: 'active',
        start_date: now.toISOString(),
        end_date: endDate.toISOString(),
      })
      .eq('id', adId);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json({ error: 'Failed to activate ad' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Free activation error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
