import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { findSupportedCity } from '@/lib/location';
import { performInstantResend } from '@/lib/email/instant-resend';

/**
 * @swagger
 * /api/location/sync-primary-neighborhood:
 *   post:
 *     summary: Sync primary neighborhood to database
 *     description: Called fire-and-forget when user changes their primary neighborhood. Updates profiles table and triggers instant email resend when city changes. Requires session auth.
 *     tags:
 *       - Location
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - neighborhoodId
 *             properties:
 *               neighborhoodId:
 *                 type: string
 *                 description: The neighborhood ID to set as primary
 *     responses:
 *       200:
 *         description: Primary neighborhood synced
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 cityChanged:
 *                   type: boolean
 *                   description: Whether the primary city changed (triggers instant resend)
 *       400:
 *         description: Missing or invalid neighborhoodId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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

    // Update profile with new primary city/neighborhood
    // Only set timezone if user doesn't have one yet — timezone is a user
    // preference (physical location), not derived from neighborhood.
    // A reader in Stockholm following NYC neighborhoods should get email at
    // 7 AM Stockholm time, not 7 AM NYC time.
    const updateData: Record<string, string> = {
      primary_city: neighborhood.city,
      primary_neighborhood_id: neighborhoodId,
    };
    if (!profile?.primary_timezone) {
      updateData.primary_timezone = timezone;
    }

    await serviceSupabase
      .from('profiles')
      .update(updateData)
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
