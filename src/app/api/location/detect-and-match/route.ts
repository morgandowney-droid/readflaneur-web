import { NextRequest, NextResponse } from 'next/server';
import { detectLocationFromIP } from '@/lib/location';
import { createClient } from '@/lib/supabase/server';
import { getDistance } from '@/lib/geo-utils';

/**
 * GET /api/location/detect-and-match
 *
 * Detects user location from IP and returns the 4 nearest neighborhoods.
 * Used by SmartRedirect to auto-feed new users.
 */
export async function GET(request: NextRequest) {
  try {
    // Get client IP from headers (Vercel sets these)
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');

    let clientIp = forwardedFor?.split(',')[0]?.trim() || realIp || undefined;

    // Skip private/local IPs
    if (clientIp?.startsWith('192.168.') ||
        clientIp?.startsWith('10.') ||
        clientIp?.startsWith('172.') ||
        clientIp === '127.0.0.1' ||
        clientIp === '::1') {
      clientIp = undefined;
    }

    const location = await detectLocationFromIP(clientIp);

    if (!location.latitude || !location.longitude) {
      return NextResponse.json(
        { success: false, error: 'Could not determine coordinates' },
        { status: 404 }
      );
    }

    // Fetch all active, non-combo neighborhoods with coordinates
    const supabase = await createClient();
    const { data: neighborhoods } = await supabase
      .from('neighborhoods')
      .select('id, name, city, latitude, longitude')
      .eq('is_active', true)
      .eq('is_combo', false)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (!neighborhoods || neighborhoods.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No neighborhoods available' },
        { status: 404 }
      );
    }

    // Sort by distance and pick nearest 4
    const withDistance = neighborhoods
      .map(n => ({
        ...n,
        distance: getDistance(
          location.latitude!,
          location.longitude!,
          n.latitude!,
          n.longitude!
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);

    return NextResponse.json({
      success: true,
      city: location.city,
      latitude: location.latitude,
      longitude: location.longitude,
      neighborhoods: withDistance.map(n => ({
        id: n.id,
        name: n.name,
        city: n.city,
      })),
    });
  } catch (error) {
    console.error('detect-and-match error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to detect location' },
      { status: 500 }
    );
  }
}
