/**
 * Keep a district edition's event listing inside the district.
 *
 * A prompt that says "only events inside the quartiere" reduces city-wide
 * listings and does not remove them: after the local-scope rule shipped on
 * 23 Sep 2026, Porta Venezia still published a volleyball final at the Unipol
 * Forum, three Arcimboldi shows and a party in Legnano, 25km away, and Prati
 * still published tourist opera in churches across the river. So for
 * district-scoped editions every listed venue is geocoded and anything outside
 * the edition's radius (plus a short walk) is dropped.
 *
 * Geocoding uses Mapbox forward geocoding with the public token, biased to the
 * edition's centre. A venue that cannot be placed at street or point level is
 * dropped too: for a district edition, fewer events that are certainly local
 * beat a listing padded with ones that might not be. If the geocoder itself is
 * unreachable for every event, the listing is returned unchanged so an outage
 * never empties an edition.
 */

import type { StructuredEvent } from '@/lib/look-ahead-events';

/** How far past the edition's radius a venue may sit: roughly a short walk. */
const WALK_MARGIN_M = 500;

/** Mapbox relevance below this is a guess, not a match. */
const MIN_RELEVANCE = 0.6;

export interface DistrictCentre {
  latitude: number;
  longitude: number;
  radiusM: number;
  city: string;
}

export interface GeofenceResult {
  kept: StructuredEvent[];
  dropped: Array<{ event: StructuredEvent; reason: string }>;
}

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

type Placement =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: string; networkError?: boolean };

async function placeVenue(query: string, centre: DistrictCentre, token: string): Promise<Placement> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?proximity=${centre.longitude},${centre.latitude}&types=poi,address&limit=1&access_token=${token}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { ok: false, reason: `geocoder HTTP ${res.status}`, networkError: res.status >= 500 || res.status === 429 };
    const json = (await res.json()) as { features?: Array<{ center?: [number, number]; relevance?: number }> };
    const f = json.features?.[0];
    if (!f?.center) return { ok: false, reason: 'venue not found' };
    if ((f.relevance ?? 0) < MIN_RELEVANCE) return { ok: false, reason: `weak match (${(f.relevance ?? 0).toFixed(2)})` };
    return { ok: true, lng: f.center[0], lat: f.center[1] };
  } catch {
    return { ok: false, reason: 'geocoder unreachable', networkError: true };
  }
}

export async function filterEventsToDistrict(
  events: StructuredEvent[],
  centre: DistrictCentre,
): Promise<GeofenceResult> {
  const token = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token || events.length === 0) return { kept: events, dropped: [] };

  const limit = centre.radiusM + WALK_MARGIN_M;
  const verdicts: Array<{ keep: boolean; reason: string; networkError?: boolean }> = new Array(events.length);

  // Small fixed concurrency: a listing is rarely more than thirty events.
  let next = 0;
  async function worker() {
    while (next < events.length) {
      const i = next++;
      const e = events[i];
      const venue = [e.location, e.address].filter(Boolean).join(', ').trim();
      if (!venue) {
        verdicts[i] = { keep: false, reason: 'no venue' };
        continue;
      }
      const query = venue.toLowerCase().includes(centre.city.toLowerCase()) ? venue : `${venue}, ${centre.city}`;
      const placed = await placeVenue(query, centre, token!);
      if (!placed.ok) {
        verdicts[i] = { keep: false, reason: placed.reason, networkError: placed.networkError };
        continue;
      }
      const d = distanceM(centre.latitude, centre.longitude, placed.lat, placed.lng);
      verdicts[i] = d <= limit
        ? { keep: true, reason: `${Math.round(d)}m` }
        : { keep: false, reason: `${(d / 1000).toFixed(1)}km from the district centre` };
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, events.length) }, worker));

  // An outage must never empty an edition.
  if (verdicts.every((v) => v.networkError)) return { kept: events, dropped: [] };

  const kept: StructuredEvent[] = [];
  const dropped: GeofenceResult['dropped'] = [];
  events.forEach((event, i) => {
    if (verdicts[i].keep) kept.push(event);
    else dropped.push({ event, reason: verdicts[i].reason });
  });
  return { kept, dropped };
}
