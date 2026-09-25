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
  // Also filter out generic tourist activities that shouldn't appear in local content
  // and anything dated before today. The search returns ongoing exhibitions under
  // the date they OPENED, so the first Vorarlberg listings for Russmedia opened on
  // "Sat, Apr 5" and "Tue, Sep 1" above today. The prose can still mention a
  // running exhibition; the dated listing is for what is coming.
  const isPast = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < localDate;
  const valid = events.filter(e => e.date && e.name?.trim() && !isPast(e.date) && !isTouristActivity(e));
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
  if (!isPlaceholder(event.category) && event.category!.trim().toLowerCase() !== event.name.trim().toLowerCase()) {
    catTimeParts.push(event.category!.trim());
  }
  if (!isPlaceholder(event.time)) {
    catTimeParts.push(event.time!.trim());
  }
  if (catTimeParts.length > 0) {
    parts.push(catTimeParts.join(', '));
  }

  // Location + cleaned address combined
  const locationParts: string[] = [];
  if (!isPlaceholder(event.location)) locationParts.push(event.location!.trim());
  if (!isPlaceholder(event.address)) {
    const cleaned = cleanAddress(event.address!, city);
    if (cleaned) locationParts.push(cleaned);
  }
  if (locationParts.length > 0) {
    parts.push(locationParts.join(', '));
  }

  // Price (if available)
  if (!isPlaceholder(event.price)) {
    parts.push(event.price!.trim());
  }

  let line = parts.join('; ');

  // Append recurring dates suffix
  if (alsoOn) {
    line += ` (also on ${alsoOn})`;
  }

  return line + '.';
}

/**
 * Check if a value is a placeholder that shouldn't be displayed.
 * Catches "Not Listed", "TBD", "TBA", "N/A", "Unknown", "Not Available", "None",
 * and "Not specified" (the first Zaragoza Look Ahead printed it as a venue and a price).
 */
export function isPlaceholder(val: string | null | undefined): boolean {
  if (!val?.trim()) return true;
  const lower = val.trim().toLowerCase();
  return ['not listed', 'tbd', 'tba', 'n/a', 'unknown', 'not available', 'none', 'not specified', 'unspecified', 'not provided', 'not stated'].includes(lower);
}

/**
 * Filter out generic tourist activities that wouldn't interest local residents.
 * Safety net in case Grok includes them despite prompt instructions.
 */
function isTouristActivity(event: StructuredEvent): boolean {
  const name = event.name.toLowerCase();
  const category = (event.category || '').toLowerCase();
  const combined = `${name} ${category}`;

  // Guided tours, food tours, walking tours
  if (/\b(guided\s+tour|walking\s+tour|food\s+tour|food\s+hall\s+tour|bike\s+tour|boat\s+tour|segway\s+tour|bus\s+tour)\b/.test(combined)) return true;

  // Hop-on-hop-off, pub crawls, escape rooms
  if (/\b(hop[- ]on[- ]hop[- ]off|pub\s+crawl|escape\s+room)\b/.test(combined)) return true;

  // Long-running permanent shows
  if (/\b(mamma\s+mia|lion\s+king|phantom\s+of\s+the\s+opera|wicked|chicago\s+the\s+musical)\b/.test(name)) return true;

  return false;
}

/**
 * Detect whether a text line is a structured event line.
 * Event lines have 2+ semicolons (the separator used by formatEventLine).
 */
export function isEventLine(text: string): boolean {
  return (text.match(/;/g) || []).length >= 2;
}

/**
 * Split a Look Ahead article body into its event listing block and its prose.
 * The listing is the `[[Event Listing]] ... ---` block formatEventListing()
 * writes at the top of the body; everything after it is the enriched prose.
 * Returns listing: null when the body has no listing.
 */
export function splitEventListing(body: string): { listing: string | null; prose: string } {
  const match = body.match(/^\s*\[\[Event Listing\]\]\s*([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!match) return { listing: null, prose: body.trim() };
  return { listing: match[1].trim(), prose: body.slice(match[0].length).trim() };
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Resolve a listing date header ("Today, Wed Sep 23" or "Thu, Sep 24") to
 * YYYY-MM-DD. formatDateHeader() writes no year, so the year comes from the
 * edition's local date, rolling forward when the month is well before the
 * edition's (a late-December listing that reaches into January).
 */
function resolveHeaderDate(header: string, localDate: string): string | null {
  if (/^today\b/i.test(header)) return localDate;
  const m = header.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  const day = parseInt(m[2], 10);
  const [baseYear, baseMonth] = localDate.split('-').map(Number);
  const year = month < baseMonth - 6 ? baseYear + 1 : baseYear;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function weekdayName(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

export interface ListedEvent extends StructuredEvent {
  /** "(also on Sun, Mon)" suffix written for a recurring event, as short day names. */
  also_on: string | null;
}

/**
 * Parse the text of an event listing (the inside of the block returned by
 * splitEventListing) back into structured events. The inverse of
 * formatEventListing()/formatEventLine(): "Name; Category, Time; Venue,
 * Address; Price." under [[date]] headers. Same reading as the article page's
 * EventListingBlock: the segment after the name holds category and time (the
 * part that looks like a clock time is the time), the next holds venue then
 * address, and the last holds price.
 */
export function parseEventListing(listing: string, localDate: string): ListedEvent[] {
  const lines = listing.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const events: ListedEvent[] = [];
  let currentDate: string | null = null;

  for (const line of lines) {
    const header = line.match(/^\[\[(.+)\]\]$/);
    if (header) {
      currentDate = resolveHeaderDate(header[1], localDate);
      continue;
    }
    if (!currentDate || !line.includes(';')) continue;

    let clean = line.replace(/\.\s*$/, '');
    let alsoOn: string | null = null;
    const also = clean.match(/\s*\(also on ([^)]+)\)\s*$/);
    if (also) {
      alsoOn = also[1].trim();
      clean = clean.slice(0, also.index);
    }

    const segments = clean.split(';').map(s => s.trim());
    const name = segments[0] || '';
    if (isPlaceholder(name)) continue;

    let category: string | null = null;
    let time: string | null = null;
    if (segments[1]) {
      const rest: string[] = [];
      for (const part of segments[1].split(',').map(s => s.trim()).filter(Boolean)) {
        if (!time && (/\d{1,2}[:.]\d{2}/.test(part) || /\d{1,2}\s*(am|pm)\b/i.test(part) || /^all day$/i.test(part))) {
          time = part;
        } else if (!isPlaceholder(part)) {
          rest.push(part);
        }
      }
      category = rest.length ? rest.join(', ') : null;
    }

    let location: string | null = null;
    let address: string | null = null;
    if (segments[2]) {
      const parts = segments[2].split(',').map(s => s.trim()).filter(Boolean);
      location = parts[0] && !isPlaceholder(parts[0]) ? parts[0] : null;
      const addr = parts.slice(1).join(', ');
      address = addr && !isPlaceholder(addr) ? addr : null;
    }

    const price = segments[3] && !isPlaceholder(segments[3]) ? segments.slice(3).join('; ') : null;

    events.push({
      date: currentDate,
      day_label: weekdayName(currentDate),
      time,
      name,
      category,
      location,
      address,
      price,
      also_on: alsoOn,
    });
  }
  return events;
}

/**
 * Drop Look Ahead prose that only repeats an event an earlier day already
 * covered. The enrichment prompt forbids repeating a venue across day
 * sections and the model does it anyway: Brera's 25 Sep edition gave the same
 * two exhibitions a paragraph on each of eight days. A paragraph in a later
 * section is dropped when every event it names was named in an earlier
 * section and it says nothing new about it (a last day, an opening, a talk).
 * A paragraph that names no known event is kept. A section left with no
 * paragraph loses its header. Runs on the English prose before translation.
 */
const NEWS_ABOUT_EVENT = /\b(last|final|closing|closes|concludes|ends?|ending|opens (?:on|at|tonight|today)|opening (?:day|night|reception)|premiere|launch|first day|vernissage|finissage|talk|q&a|screening|special|guest|reception|preview|sold out|extended|reopens?|reopening)\b/i;

// Only padding is dropped: a paragraph saying an exhibition or run is still on.
// A second performance, another tour or a market returning on its day stays.
const STILL_ON = /\b(continues|continuing|is (?:also |still )?open|remains open|still (?:open|running|on)|you can still|there is still time|is on view|remains on view|on display)\b/i;

function coreName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(exhibition|mostra|show|concert|festival|opening|closing day|art exhibition)\b/g, ' ')
    .replace(/[“”"'’:;,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function dropRepeatedDayMentions(prose: string, events: StructuredEvent[]): { prose: string; dropped: string[] } {
  const keys = new Set<string>();
  for (const e of events) {
    const n = coreName(e.name || '');
    if (n.length >= 5) keys.add(n);
    const loc = coreName(e.location || '');
    if (loc.length >= 8) keys.add(loc);
  }
  const lines = prose.replace(/\r\n/g, '\n').split('\n');
  type Section = { header: string | null; paras: string[] };
  const sections: Section[] = [{ header: null, paras: [] }];
  let buf: string[] = [];
  const flush = () => { if (buf.length) { sections[sections.length - 1].paras.push(buf.join('\n')); buf = []; } };
  for (const line of lines) {
    const t = line.trim();
    if (/^\[\[[^\]]+\]\]$/.test(t) || /^#{2,3}\s+\S/.test(t)) { flush(); sections.push({ header: t, paras: [] }); continue; }
    if (!t) { flush(); continue; }
    buf.push(line);
  }
  flush();

  const seen = new Set<string>();
  const dropped: string[] = [];
  let daySections = 0;
  for (const s of sections) {
    if (!s.header) continue;
    daySections++;
    const kept: string[] = [];
    const namedHere = new Set<string>();
    for (const p of s.paras) {
      const text = coreName(p);
      const quoted = Array.from(p.matchAll(/["“]([^"”]{4,80})["”]/g)).map((m) => coreName(m[1])).filter((q) => q.length >= 4);
      const named = new Set<string>([...Array.from(keys).filter((k) => text.includes(k)), ...quoted]);
      const repeatOnly = daySections > 1 && named.size > 0 && STILL_ON.test(p) && Array.from(named).every((k) => seen.has(k)) && !NEWS_ABOUT_EVENT.test(p);
      if (repeatOnly) { dropped.push(p.slice(0, 80)); continue; }
      kept.push(p);
      named.forEach((k) => namedHere.add(k));
    }
    namedHere.forEach((k) => seen.add(k));
    s.paras = kept;
  }
  if (!dropped.length) return { prose, dropped };
  const out: string[] = [];
  for (const s of sections) {
    if (s.header && s.paras.length === 0) continue;
    if (s.header) out.push(s.header);
    out.push(...s.paras.map((p) => p + '\n'));
  }
  return { prose: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), dropped };
}
