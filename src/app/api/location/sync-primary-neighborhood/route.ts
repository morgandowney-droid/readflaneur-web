import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { findSupportedCity } from '@/lib/location';
import { performInstantResend } from '@/lib/email/instant-resend';

/**
 * POST /api/location/sync-primary-neighborhood
 *
 * Called fire-and-forget from useNeighborhoodPreferences.setPrimary()
 * so all primary-change paths (ContextSwitcher, modal, drag-reorder)
 * sync to the DB and trigger an instant email resend when the city changes.
 *
 * Body: { neighborhoodId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { neighborhoodId } = body;

    if (!neighborhoodId || typeof neighborhoodId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'neighborhoodId is required' },
        { status: 400 }
      );
    }

    // Use getSession() — instant, no network call (per project convention)
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

    const { data: { session } } = await supabase.auth.getSession();

    // Silent no-op for anonymous users
    if (!session?.user) {
      return NextResponse.json({ success: true, cityChanged: false });
    }

    const userId = session.user.id;

    // Look up neighborhood to get its city
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: neighborhood } = await serviceSupabase
      .from('neighborhoods')
      .select('id, city')
      .eq('id', neighborhoodId)
      .single();

    if (!neighborhood) {
      return NextResponse.json(
        { success: false, error: 'Neighborhood not found' },
        { status: 404 }
      );
    }

    // Get timezone from city mapping
    const cityInfo = findSupportedCity(neighborhood.city);
    const timezone = cityInfo?.timezone || 'America/New_York';

    // Check if city actually changed
    const { data: profile } = await serviceSupabase
      .from('profiles')
      .select('primary_city, primary_timezone')
      .eq('id', userId)
      .single();

    const cityChanged = profile?.primary_city !== neighborhood.city;

    // Update profile with new primary city/timezone/neighborhood
    await serviceSupabase
      .from('profiles')
      .update({
        primary_city: neighborhood.city,
        primary_timezone: timezone,
        primary_neighborhood_id: neighborhoodId,
      })
      .eq('id', userId);

    // Trigger instant resend on any primary change (same city or different)
    performInstantResend(serviceSupabase, {
      userId,
      source: 'profile',
      trigger: 'neighborhood_change',
    }).catch(() => {});

    return NextResponse.json({ success: true, cityChanged });
  } catch (error) {
    console.error('Sync primary neighborhood error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sync primary neighborhood' },
      { status: 500 }
    );
  }
}
