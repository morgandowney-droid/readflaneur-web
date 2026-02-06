import { NextRequest, NextResponse } from 'next/server';
import { detectLocationFromIP } from '@/lib/location';

/**
 * GET /api/location/detect
 *
 * Detect user location from IP address using ipinfo.io
 * Returns detected city, country, timezone, and matched Flaneur city
 */
export async function GET(request: NextRequest) {
  try {
    // Get client IP from headers (Vercel sets these)
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');

    // Use first IP if multiple are forwarded
    let clientIp = forwardedFor?.split(',')[0]?.trim() || realIp || undefined;

    // Skip private/local IPs (use ipinfo.io auto-detection)
    if (clientIp?.startsWith('192.168.') ||
        clientIp?.startsWith('10.') ||
        clientIp?.startsWith('172.') ||
        clientIp === '127.0.0.1' ||
        clientIp === '::1') {
      clientIp = undefined;
    }

    const location = await detectLocationFromIP(clientIp);

    return NextResponse.json({
      success: true,
      location: {
        detectedCity: location.city,
        detectedCountry: location.country,
        timezone: location.timezone,
        matchedCity: location.matchedCity?.city || null,
        matchedCountry: location.matchedCity?.country || null,
        matchedTimezone: location.matchedCity?.timezone || location.timezone,
        confidence: location.confidence,
        method: location.method,
      },
    });
  } catch (error) {
    console.error('Location detection error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to detect location' },
      { status: 500 }
    );
  }
}
