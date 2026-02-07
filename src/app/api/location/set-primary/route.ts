import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { findSupportedCity } from '@/lib/location';

/**
 * POST /api/location/set-primary
 *
 * Save user's primary location to their profile (logged in)
 * or return data for localStorage storage (anonymous)
 *
 * Body: { city: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { city } = body;

    if (!city || typeof city !== 'string') {
      return NextResponse.json(
        { success: false, error: 'City is required' },
        { status: 400 }
      );
    }

    // Validate city is in our supported list
    const matchedCity = findSupportedCity(city);
    if (!matchedCity) {
      return NextResponse.json(
        { success: false, error: 'City is not supported' },
        { status: 400 }
      );
    }

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

    // Check if user is logged in
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // Save to profile for logged-in users
      const { error } = await supabase
        .from('profiles')
        .update({
          primary_city: matchedCity.city,
          primary_timezone: matchedCity.timezone,
          location_prompt_dismissed_at: null, // Clear dismissed state
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error saving primary location:', error);
        return NextResponse.json(
          { success: false, error: 'Failed to save location' },
          { status: 500 }
        );
      }

      // Fire-and-forget: resend today's Daily Brief with updated timezone
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\n$/, '').replace(/\/$/, '')
        || 'https://readflaneur.com';
      const resendSecret = process.env.CRON_SECRET;
      if (resendSecret) {
        fetch(`${baseUrl}/api/internal/resend-daily-brief`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': resendSecret },
          body: JSON.stringify({ userId: user.id, source: 'profile', trigger: 'city_change' }),
        }).catch(() => {});
      }
    }

    // Return the location data (for both logged in and anonymous)
    // Anonymous users will store this in localStorage on the client
    return NextResponse.json({
      success: true,
      location: {
        city: matchedCity.city,
        timezone: matchedCity.timezone,
        country: matchedCity.country,
      },
      savedToProfile: !!user,
    });
  } catch (error) {
    console.error('Set primary location error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to set location' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/location/set-primary
 *
 * Clear user's primary location
 */
export async function DELETE() {
  try {
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

    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({
          primary_city: null,
          primary_timezone: null,
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error clearing primary location:', error);
        return NextResponse.json(
          { success: false, error: 'Failed to clear location' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Clear primary location error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to clear location' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/location/set-primary
 *
 * Dismiss the location prompt (don't ask again for 30 days)
 */
export async function PUT() {
  try {
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

    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({
          location_prompt_dismissed_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error dismissing location prompt:', error);
        return NextResponse.json(
          { success: false, error: 'Failed to dismiss prompt' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Dismiss location prompt error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to dismiss prompt' },
      { status: 500 }
    );
  }
}
