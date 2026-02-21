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
 * Groups events by date, sorted chronologically. Returns empty string
 * if no valid events are provided.
 *
 * Output format:
 * [[Event Listing]]
 *
 * **Today, Sat Feb 21**
 * 10:00, 14:00; Stockholm Food; Guided Walking Tour; Ostermalms Saluhall.
 * 12:00-15:00; "Near and Far"; Art exhibition; Djurgarden.
 *
 * **Fri, Feb 27**
 * 19:00; Nordic world music concert; Stallet, Stallgatan 7.
 *
 * ---
 */
export function formatEventListing(
  events: StructuredEvent[],
  localDate: string, // YYYY-MM-DD of "today" in neighborhood's timezone
): string {
  // Filter out invalid events (must have date and name at minimum)
  const valid = events.filter(e => e.date && e.name?.trim());
  if (valid.length === 0) return '';

  // Group by date
  const grouped = new Map<string, StructuredEvent[]>();
  for (const event of valid) {
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
      // Extract first time token for comparison
      const timeA = a.time.match(/\d{1,2}:\d{2}/)?.[0] || '';
      const timeB = b.time.match(/\d{1,2}:\d{2}/)?.[0] || '';
      return timeA.localeCompare(timeB);
    });

    // Format date header
    const dateHeader = formatDateHeader(date, localDate);
    const lines: string[] = [`**${dateHeader}**`];

    for (const event of dateEvents) {
      lines.push(formatEventLine(event));
    }

    sections.push(lines.join('\n'));
  }

  return `[[Event Listing]]\n\n${sections.join('\n\n')}\n\n---`;
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
 * Format a single event into a semicolon-separated line.
 * Only includes fields that have values.
 */
function formatEventLine(event: StructuredEvent): string {
  const parts: string[] = [];

  // Time (if available)
  if (event.time?.trim()) {
    parts.push(event.time.trim());
  }

  // Event name (always present, quoted if it looks like a title)
  parts.push(event.name.trim());

  // Category (if available and different from name)
  if (event.category?.trim() && event.category.trim().toLowerCase() !== event.name.trim().toLowerCase()) {
    parts.push(event.category.trim());
  }

  // Location + address combined
  const locationParts: string[] = [];
  if (event.location?.trim()) locationParts.push(event.location.trim());
  if (event.address?.trim()) locationParts.push(event.address.trim());
  if (locationParts.length > 0) {
    parts.push(locationParts.join(', '));
  }

  // Price (if available)
  if (event.price?.trim()) {
    parts.push(event.price.trim());
  }

  return parts.join('; ') + '.';
}

/**
 * Detect whether a text line is a structured event line.
 * Event lines have 2+ semicolons (the separator used by formatEventLine).
 */
export function isEventLine(text: string): boolean {
  return (text.match(/;/g) || []).length >= 2;
}
