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
 * Geocoding uses OpenStreetMap's Nominatim, one request a second as its usage
 * policy requires (the Mapbox token in this project is restricted to the
 * website's own URL, so a server call gets a 403). Each venue is tried by
 * street address first, then by venue name, both with the edition's city. A
 * venue that cannot be placed is dropped: for a district edition, fewer events
 * that are certainly local beat a listing padded with ones that might not be.
 * If the geocoder is unreachable for every event, the listing is returned
 * unchanged so an outage never empties an edition.
 */

import type { StructuredEvent } from '@/lib/look-ahead-events';

/** How far past the edition's radius a venue may sit: roughly a short walk. */
const WALK_MARGIN_M = 500;

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

const USER_AGENT = 'readflaneur-geofence/1.0 (contact@readflaneur.com)';
let lastRequestAt = 0;

async function politePause() {
  const wait = lastRequestAt + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function geocode(query: string): Promise<Placement> {
  await politePause();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, reason: `geocoder HTTP ${res.status}`, networkError: true };
    const json = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const f = json[0];
    if (!f?.lat || !f?.lon) return { ok: false, reason: 'venue not found' };
    return { ok: true, lat: Number(f.lat), lng: Number(f.lon) };
  } catch {
    return { ok: false, reason: 'geocoder unreachable', networkError: true };
  }
}

/** Address first, then venue name; both anchored to the city. */
async function placeVenue(e: StructuredEvent, city: string, cache: Map<string, Placement>): Promise<Placement> {
  const withCity = (s: string) => (s.toLowerCase().includes(city.toLowerCase()) ? s : `${s}, ${city}`);
  const tries = [e.address, e.location].filter((x): x is string => !!x && x.trim().length > 2).map((x) => withCity(x.trim()));
  if (tries.length === 0) return { ok: false, reason: 'no venue' };
  let last: Placement = { ok: false, reason: 'venue not found' };
  for (const q of tries) {
    const cached = cache.get(q);
    const placed = cached ?? (await geocode(q));
    cache.set(q, placed);
    if (placed.ok) return placed;
    last = placed;
  }
  return last;
}

export async function filterEventsToDistrict(
  events: StructuredEvent[],
  centre: DistrictCentre,
): Promise<GeofenceResult> {
  if (events.length === 0) return { kept: events, dropped: [] };

  const limit = centre.radiusM + WALK_MARGIN_M;
  const cache = new Map<string, Placement>();
  // Sequential on purpose: Nominatim allows one request a second.
  const verdicts: Array<{ keep: boolean; reason: string; networkError?: boolean }> = [];
  for (const e of events) {
    const placed = await placeVenue(e, centre.city, cache);
    if (!placed.ok) {
      verdicts.push({ keep: false, reason: placed.reason, networkError: placed.networkError });
      continue;
    }
    const d = distanceM(centre.latitude, centre.longitude, placed.lat, placed.lng);
    verdicts.push(d <= limit
      ? { keep: true, reason: `${Math.round(d)}m` }
      : { keep: false, reason: `${(d / 1000).toFixed(1)}km from the district centre` });
  }

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
