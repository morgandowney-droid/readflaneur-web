import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDistance } from '@/lib/geo-utils';

/**
 * Check whether a neighborhood is available for a prospective broker.
 *
 * Treats a neighborhood as AVAILABLE when:
 *  - No existing setup/active row, OR
 *  - The only row is owned by the viewer (matched by optional `?email=`), OR
 *  - The only row is a stale abandoned setup (>STALE_SETUP_HOURS old, no
 *    stripe_customer_id = checkout never started). We also auto-delete these
 *    so subsequent checks don't repeat the work.
 *
 * When TAKEN and the caller passes an email, the broker is added to
 * `partner_waitlist` so they get auto-notified when the existing partner cancels.
 * The response also includes nearby neighborhoods that are currently available
 * so the broker has an immediate "act fast on the next-best slot" path.
 */
const STALE_SETUP_HOURS = 24;
const NEARBY_RADIUS_KM = 15;
const NEARBY_LIMIT = 5;

type NeighborhoodRow = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  is_combo: boolean | null;
};

export async function GET(request: NextRequest) {
  try {
    const neighborhoodId = request.nextUrl.searchParams.get('id');
    const viewerEmail = request.nextUrl.searchParams.get('email')?.toLowerCase().trim() || null;
    const viewerName = request.nextUrl.searchParams.get('name')?.trim() || null;
    const viewerBrokerage = request.nextUrl.searchParams.get('brokerage')?.trim() || null;

    if (!neighborhoodId) {
      return NextResponse.json({ error: 'Missing neighborhood id' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: rows } = await supabaseAdmin
      .from('agent_partners')
      .select('id, agent_name, agent_email, status, stripe_customer_id, created_at, updated_at')
      .eq('neighborhood_id', neighborhoodId)
      .in('status', ['setup', 'active']);

    const available = () => NextResponse.json({ available: true, takenBy: null });

    if (!rows || rows.length === 0) {
      return available();
    }

    const staleCutoffMs = Date.now() - STALE_SETUP_HOURS * 60 * 60 * 1000;
    const staleIds: string[] = [];
    let blocker: { id: string; agent_name: string; agent_email: string } | null = null;

    for (const row of rows) {
      if (viewerEmail && row.agent_email?.toLowerCase() === viewerEmail) {
        continue;
      }
      const ref = new Date(row.updated_at || row.created_at).getTime();
      if (row.status === 'setup' && !row.stripe_customer_id && ref < staleCutoffMs) {
        staleIds.push(row.id);
        continue;
      }
      blocker = { id: row.id, agent_name: row.agent_name, agent_email: row.agent_email };
      break;
    }

    if (staleIds.length > 0 && !blocker) {
      await supabaseAdmin.from('agent_partners').delete().in('id', staleIds);
    }

    if (!blocker) {
      return available();
    }

    // ─── Taken path ───────────────────────────────────────────────────────────

    // Save broker's interest to the waitlist if we have their email. Upsert so
    // repeated visits don't error. We deliberately don't require name/brokerage
    // so even a partially-filled form captures interest.
    let waitlisted = false;
    if (viewerEmail) {
      const { error: waitErr } = await supabaseAdmin
        .from('partner_waitlist')
        .upsert(
          {
            neighborhood_id: neighborhoodId,
            broker_email: viewerEmail,
            broker_name: viewerName,
            brokerage_name: viewerBrokerage,
            source: 'setup_blocked',
          },
          { onConflict: 'neighborhood_id,broker_email', ignoreDuplicates: false }
        );
      if (!waitErr) {
        waitlisted = true;
      } else {
        console.error('partner_waitlist upsert failed:', waitErr);
      }
    }

    // Find nearby available neighborhoods. Fetch coords of the requested
    // neighborhood, then Haversine-sort all active non-combo neighborhoods
    // within NEARBY_RADIUS_KM, excluding any that already have an active/setup
    // partner.
    const nearbyAvailable: Array<{
      id: string;
      name: string;
      city: string | null;
      distanceKm: number;
    }> = [];

    const { data: target } = await supabaseAdmin
      .from('neighborhoods')
      .select('id, name, city, country, latitude, longitude, is_active, is_combo')
      .eq('id', neighborhoodId)
      .single<NeighborhoodRow>();

    if (target?.latitude != null && target?.longitude != null) {
      const { data: taken } = await supabaseAdmin
        .from('agent_partners')
        .select('neighborhood_id')
        .in('status', ['setup', 'active']);

      const takenSet = new Set((taken || []).map((r) => r.neighborhood_id));
      takenSet.add(neighborhoodId); // exclude the current one

      const { data: candidates } = await supabaseAdmin
        .from('neighborhoods')
        .select('id, name, city, country, latitude, longitude, is_active, is_combo')
        .eq('is_active', true)
        .or('is_combo.is.null,is_combo.eq.false');

      const ranked = (candidates || [])
        .filter((n: NeighborhoodRow) => !takenSet.has(n.id))
        .filter((n: NeighborhoodRow) => n.latitude != null && n.longitude != null)
        .map((n: NeighborhoodRow) => ({
          id: n.id,
          name: n.name,
          city: n.city,
          distanceKm: getDistance(target.latitude!, target.longitude!, n.latitude!, n.longitude!),
        }))
        .filter((n) => n.distanceKm <= NEARBY_RADIUS_KM)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, NEARBY_LIMIT);

      nearbyAvailable.push(...ranked);
    }

    return NextResponse.json({
      available: false,
      takenBy: blocker.agent_name,
      waitlisted,
      nearbyAvailable,
    });
  } catch (err) {
    console.error('check-neighborhood error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
