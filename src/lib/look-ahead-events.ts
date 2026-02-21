/**
 * Structured event listing for Look Ahead articles.
 * Formats Grok-returned event JSON into a scannable at-a-glance listing
 * prepended to the prose body of Look Ahead articles.
 */

export interface StructuredEvent {
  date: string;              // YYYY-MM-DD
  day_label: string;         // "Saturday"
  time?: string | null;      // "10:00", "12:00-15:00", "19:00 Doors open", null
  name: string;              // Event name (required)
  category?: string | null;  // "Art Exhibition", "Concert", etc.
  location?: string | null;  // Venue name
  address?: string | null;   // Street address
  price?: string | null;     // "SEK 250", "Free", "$45", null
}

/**
 * Format a list of structured events into a readable text listing.
 * Groups events by date, deduplicates recurring events, sorts chronologically.
 * Returns empty string if no valid events are provided.
 *
 * Output format:
 * [[Event Listing]]
 *
 * [[Today, Sat Feb 21]]
 * Guided Walking Tour; Food Tour, 10:00; Ostermalms Saluhall (also on Sun, Mon).
 * "Near and Far"; Art exhibition, 12:00-15:00; Djurgarden.
 *
 * [[Fri, Feb 27]]
 * Nordic world music concert; Concert, 19:00; Stallet, Stallgatan 7.
 *
 * ---
 */
export function formatEventListing(
  events: StructuredEvent[],
  localDate: string, // YYYY-MM-DD of "today" in neighborhood's timezone
  city?: string,     // City name to strip from addresses
): string {
  // Filter out invalid events (must have date and name at minimum)
  const valid = events.filter(e => e.date && e.name?.trim());
  if (valid.length === 0) return '';

  // Deduplicate recurring events: same name across multiple dates
  // Keep first occurrence and append "(also on Sun, Mon)" etc.
  const { deduped, recurringDates } = deduplicateRecurring(valid, localDate);

  // Group by date
  const grouped = new Map<string, StructuredEvent[]>();
  for (const event of deduped) {
    const existing = grouped.get(event.date) || [];
    existing.push(event);
    grouped.set(event.date, existing);
  }

  // Sort dates chronologically
  const sortedDates = Array.from(grouped.keys()).sort();

  const sections: string[] = [];

  for (const date of sortedDates) {
    const dateEvents = grouped.get(date)!;
    // Sort events within a date by time (events without time go last)
    dateEvents.sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      const timeA = a.time.match(/\d{1,2}:\d{2}/)?.[0] || '';
      const timeB = b.time.match(/\d{1,2}:\d{2}/)?.[0] || '';
      return timeA.localeCompare(timeB);
    });

    // Format date header using [[header]] syntax so ArticleBody renders as <h3>
    const dateHeader = formatDateHeader(date, localDate);
    const lines: string[] = [`[[${dateHeader}]]`];

    for (const event of dateEvents) {
      const alsoOn = recurringDates.get(event.name.trim().toLowerCase());
      lines.push(formatEventLine(event, city, alsoOn));
    }

    // Use \n\n between all lines so ArticleBody splits them into separate paragraphs
    sections.push(lines.join('\n\n'));
  }

  return `[[Event Listing]]\n\n${sections.join('\n\n')}\n\n---`;
}

/**
 * Deduplicate recurring events (same name on multiple dates).
 * Returns only the first occurrence of each event and a map of
 * additional dates formatted as short day names.
 */
function deduplicateRecurring(
  events: StructuredEvent[],
  localDate: string,
): { deduped: StructuredEvent[]; recurringDates: Map<string, string> } {
  // Group events by normalized name
  const byName = new Map<string, StructuredEvent[]>();
  for (const event of events) {
    const key = event.name.trim().toLowerCase();
    const existing = byName.get(key) || [];
    existing.push(event);
    byName.set(key, existing);
  }

  const recurringDates = new Map<string, string>();
  const deduped: StructuredEvent[] = [];
  const seen = new Set<string>();

  // Sort all events by date for stable first-occurrence
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  for (const event of sorted) {
    const key = event.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const allOccurrences = byName.get(key) || [];
    if (allOccurrences.length > 1) {
      // Format the additional dates (excluding the first one)
      const otherDates = allOccurrences
        .slice(1)
        .map(e => formatShortDay(e.date, localDate))
        .filter(Boolean);
      if (otherDates.length > 0) {
        recurringDates.set(key, otherDates.join(', '));
      }
    }

    deduped.push(event);
  }

  return { deduped, recurringDates };
}

/**
 * Format a date as a short day label for "also on" suffix.
 */
function formatShortDay(date: string, localDate: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
  if (date === localDate) return 'Today';
  return dayName;
}

/**
 * Format a date string into a display header.
 * "Today" is used for the local date, otherwise "Day, Mon DD".
 */
function formatDateHeader(date: string, localDate: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
  const monthName = d.toLocaleDateString('en-US', { month: 'short' });

  if (date === localDate) {
    return `Today, ${dayName} ${monthName} ${day}`;
  }

  return `${dayName}, ${monthName} ${day}`;
}

/**
 * Strip postcodes and city name from an address string.
 * "Ostermalmstorg 31, 114 39 Stockholm" -> "Ostermalmstorg 31"
 */
function cleanAddress(address: string, city?: string): string {
  let cleaned = address.trim();

  // Strip postcode + city at end: ", 114 39 Stockholm" or ", 10001 New York"
  cleaned = cleaned.replace(/,\s*\d{2,6}\s*\d{0,4}\s+[A-Za-z\u00C0-\u024F\s]+$/, '');

  // Strip bare city name at end: ", Stockholm" or ", New York"
  if (city) {
    const cityRegex = new RegExp(',\\s*' + escapeRegex(city) + '\\s*$', 'i');
    cleaned = cleaned.replace(cityRegex, '');
  }

  return cleaned;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Format a single event into a semicolon-separated line.
 * Order: Name; Category + Time; Venue, Address; Price.
 * Only includes fields that have values.
 */
function formatEventLine(event: StructuredEvent, city?: string, alsoOn?: string): string {
  const parts: string[] = [];

  // Event name first (always present)
  parts.push(event.name.trim());

  // Category + time combined (e.g., "Art Exhibition, 17:00-20:00")
  const catTimeParts: string[] = [];
  if (event.category?.trim() && event.category.trim().toLowerCase() !== event.name.trim().toLowerCase()) {
    catTimeParts.push(event.category.trim());
  }
  if (event.time?.trim()) {
    catTimeParts.push(event.time.trim());
  }
  if (catTimeParts.length > 0) {
    parts.push(catTimeParts.join(', '));
  }

  // Location + cleaned address combined
  const locationParts: string[] = [];
  if (event.location?.trim()) locationParts.push(event.location.trim());
  if (event.address?.trim()) {
    const cleaned = cleanAddress(event.address, city);
    if (cleaned) locationParts.push(cleaned);
  }
  if (locationParts.length > 0) {
    parts.push(locationParts.join(', '));
  }

  // Price (if available)
  if (event.price?.trim()) {
    parts.push(event.price.trim());
  }

  let line = parts.join('; ');

  // Append recurring dates suffix
  if (alsoOn) {
    line += ` (also on ${alsoOn})`;
  }

  return line + '.';
}

/**
 * Detect whether a text line is a structured event line.
 * Event lines have 2+ semicolons (the separator used by formatEventLine).
 */
export function isEventLine(text: string): boolean {
  return (text.match(/;/g) || []).length >= 2;
}
