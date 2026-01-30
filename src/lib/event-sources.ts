/**
 * Event Sources for Tonight Picks
 *
 * Integrates with various event APIs to find local happenings.
 */

// Neighborhood coordinates for event searches
export const NEIGHBORHOOD_COORDS: Record<string, { lat: number; lng: number; radius: number; city: string }> = {
  'nyc-west-village': { lat: 40.7336, lng: -74.0027, radius: 1, city: 'New York' },
  'london-notting-hill': { lat: 51.5117, lng: -0.2054, radius: 2, city: 'London' },
  'sf-pacific-heights': { lat: 37.7925, lng: -122.4350, radius: 2, city: 'San Francisco' },
  'stockholm-ostermalm': { lat: 59.3380, lng: 18.0850, radius: 2, city: 'Stockholm' },
  'sydney-paddington': { lat: -33.8847, lng: 151.2265, radius: 2, city: 'Sydney' },
};

export interface RawEvent {
  title: string;
  description?: string;
  venue_name?: string;
  venue_address?: string;
  start_date: string; // ISO date
  start_time?: string; // HH:MM
  end_time?: string;
  is_free: boolean;
  price_info?: string;
  url?: string;
  source_platform: string;
  external_id: string;
  category_hint?: string;
}

/**
 * Fetch events from Eventbrite API
 */
export async function fetchEventbriteEvents(
  neighborhoodId: string,
  dateStart: string,
  dateEnd: string
): Promise<RawEvent[]> {
  const apiKey = process.env.EVENTBRITE_API_KEY;
  if (!apiKey) {
    console.log('Eventbrite API key not configured');
    return [];
  }

  const coords = NEIGHBORHOOD_COORDS[neighborhoodId];
  if (!coords) return [];

  try {
    const params = new URLSearchParams({
      'location.latitude': coords.lat.toString(),
      'location.longitude': coords.lng.toString(),
      'location.within': `${coords.radius}km`,
      'start_date.range_start': dateStart,
      'start_date.range_end': dateEnd,
      'expand': 'venue',
    });

    const response = await fetch(
      `https://www.eventbriteapi.com/v3/events/search/?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      console.error('Eventbrite API error:', response.status);
      return [];
    }

    const data = await response.json();

    return (data.events || []).map((event: any) => ({
      title: event.name?.text || 'Untitled Event',
      description: event.description?.text?.slice(0, 500),
      venue_name: event.venue?.name,
      venue_address: event.venue?.address?.localized_address_display,
      start_date: event.start?.local?.split('T')[0],
      start_time: event.start?.local?.split('T')[1]?.slice(0, 5),
      end_time: event.end?.local?.split('T')[1]?.slice(0, 5),
      is_free: event.is_free || false,
      price_info: event.is_free ? 'Free' : undefined,
      url: event.url,
      source_platform: 'eventbrite',
      external_id: event.id,
      category_hint: event.category?.name,
    }));
  } catch (error) {
    console.error('Eventbrite fetch error:', error);
    return [];
  }
}

/**
 * Fetch events from Google Places (using nearby search for event venues)
 */
export async function fetchGooglePlacesEvents(
  neighborhoodId: string
): Promise<RawEvent[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const coords = NEIGHBORHOOD_COORDS[neighborhoodId];
  if (!coords) return [];

  // Search for venues that typically host events
  const eventVenueTypes = ['art_gallery', 'museum', 'night_club', 'bar', 'restaurant'];

  const events: RawEvent[] = [];

  for (const venueType of eventVenueTypes.slice(0, 2)) { // Limit API calls
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.currentOpeningHours,places.websiteUri',
        },
        body: JSON.stringify({
          includedTypes: [venueType],
          maxResultCount: 10,
          locationRestriction: {
            circle: {
              center: { latitude: coords.lat, longitude: coords.lng },
              radius: coords.radius * 1000,
            },
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Note: Google Places doesn't have event data directly
        // This is more for venue discovery - actual events would need website scraping
      }
    } catch (error) {
      console.error(`Google Places fetch error for ${venueType}:`, error);
    }
  }

  return events;
}

/**
 * Parse events from an RSS/Atom feed (for venue websites)
 */
export async function fetchRSSEvents(
  feedUrl: string,
  neighborhoodId: string
): Promise<RawEvent[]> {
  try {
    const response = await fetch(feedUrl);
    if (!response.ok) return [];

    const xml = await response.text();

    // Simple RSS parsing (in production, use a proper XML parser)
    const items: RawEvent[] = [];
    const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

    for (const item of itemMatches.slice(0, 20)) {
      const title = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1];
      const link = item.match(/<link>(.*?)<\/link>/)?.[1];
      const description = item.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/)?.[1];
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1];

      if (title && pubDate) {
        const date = new Date(pubDate);
        items.push({
          title: title.replace(/<[^>]*>/g, '').trim(),
          description: description?.replace(/<[^>]*>/g, '').slice(0, 500),
          start_date: date.toISOString().split('T')[0],
          is_free: false,
          url: link,
          source_platform: 'rss',
          external_id: link || `rss-${Date.now()}-${Math.random()}`,
        });
      }
    }

    return items;
  } catch (error) {
    console.error('RSS fetch error:', error);
    return [];
  }
}

/**
 * Scrape events from Time Out (example - would need proper implementation)
 */
export async function fetchTimeOutEvents(
  city: string,
  dateStart: string
): Promise<RawEvent[]> {
  // Time Out doesn't have a public API
  // This would require web scraping with proper consent
  // Placeholder for future implementation
  return [];
}

/**
 * Combine events from all sources
 */
export async function fetchAllEvents(
  neighborhoodId: string,
  daysAhead: number = 7
): Promise<RawEvent[]> {
  const now = new Date();
  const dateStart = now.toISOString();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + daysAhead);
  const dateEnd = endDate.toISOString();

  const [eventbriteEvents] = await Promise.all([
    fetchEventbriteEvents(neighborhoodId, dateStart, dateEnd),
    // Add more sources as they become available
  ]);

  // Combine and deduplicate
  const allEvents = [...eventbriteEvents];

  // Simple deduplication by title similarity
  const seen = new Set<string>();
  return allEvents.filter(event => {
    const key = event.title.toLowerCase().slice(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
