/**
 * Event times that are really UTC.
 *
 * Listing pages carry a machine timestamp beside the printed time, often in
 * UTC ("2026-10-16T23:00:00Z"). The search models copy it as if it were local,
 * so a 6 PM Christmas parade in Shreveport (UTC-5) published as "11:00 PM".
 * The prompts now say times are local; this is the deterministic check behind
 * them, because a prompt rule alone is not enough.
 *
 * It only acts where the error is visible. West of UTC by four hours or more
 * (the Americas), a UTC evening lands between 11 PM and 6 AM local, hours when
 * almost nothing but nightlife happens. East of UTC the shifted time lands in
 * the morning or afternoon and looks plausible, so there is nothing to test.
 *
 * A suspect time is removed and the event kept: an event without a time is
 * still useful; a wrong time sends a reader to an empty hall.
 */

import type { StructuredEvent } from './look-ahead-events';

/**
 * Events that genuinely happen late at night or before dawn, and incidents,
 * whose time reports when something happened ("a gunfight at 2:09 a.m.").
 */
const LATE_NIGHT_OK =
  /\b(?:night ?club|club|dj|late[- ]night|after[- ]?party|after ?dark|party|midnight|burlesque|rave|lounge|bar|pub|tavern|karaoke|new year|countdown|drag|horror|r&b|rnb|afrobeats?|hip[- ]?hop|reggaeton|techno|edm|overnight|vigil|stargaz\w*|astronom\w*|meteor|eclipse|sunrise|dawn|lock-?in|all[- ]night|night market|moonlight|shoot\w*|shot|gun\w*|killed|stabb\w*|arrest\w*|police|crash\w*|collision|fire|blaze|robbery|incident|emergency|outage)\b/i;

/** UTC offset in hours for a timezone on a given date (DST-aware). */
export function utcOffsetHours(timezone: string, at: Date = new Date()): number {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value || '';
    const m = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) return 0; // "GMT" alone is UTC
    const h = Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0);
    return m[1] === '-' ? -h : h;
  } catch {
    return 0;
  }
}

/** True when the check applies to this edition's timezone. */
export function checksLateTimes(timezone: string | null | undefined, at: Date = new Date()): boolean {
  return !!timezone && utcOffsetHours(timezone, at) <= -4;
}

/** 23:00 to 05:59, the window a UTC evening lands in for the Americas. */
function isSuspectHour(h24: number): boolean {
  return h24 >= 23 || h24 < 6;
}

/** Parse the first clock time in a string to a 24-hour hour, or null. */
export function firstHour(time: string | null | undefined): number | null {
  if (!time) return null;
  const twelve = time.match(/\b(1[0-2]|0?[1-9])(?::[0-5]\d)?\s*([ap])\.?\s?m\b/i);
  const twentyFour = time.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
  // Whichever comes first in the string is the start time.
  if (twelve && (!twentyFour || (twelve.index ?? 0) <= (twentyFour.index ?? 0))) {
    const h = Number(twelve[1]) % 12;
    return twelve[2].toLowerCase() === 'p' ? h + 12 : h;
  }
  if (twentyFour) return Number(twentyFour[1]);
  return null;
}

/**
 * Structured listing events: clear a suspect start time. Returns the events
 * (same order) and the names whose time was cleared, for logging.
 */
export function clearSuspectEventTimes(
  events: StructuredEvent[],
  timezone: string | null | undefined,
): { events: StructuredEvent[]; cleared: string[] } {
  if (!checksLateTimes(timezone)) return { events, cleared: [] };
  const cleared: string[] = [];
  const out = events.map((e) => {
    const h = firstHour(e.time);
    if (h === null || !isSuspectHour(h)) return e;
    if (LATE_NIGHT_OK.test(`${e.name} ${e.category || ''} ${e.location || ''}`)) return e;
    cleared.push(e.name);
    return { ...e, time: null };
  });
  return { events: out, cleared };
}

// "p.m." keeps its final dot only mid-sentence; at a sentence end it is the full stop.
const CLOCK = String.raw`(?:(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*[ap]\.?\s?m\b(?:\.(?=\S))?|(?:[01]?\d|2[0-3]):[0-5]\d\b)`;
/** ", starting at 11:00 PM", " at 11 PM", " from 11:00 PM to 1:00 AM" */
const TIME_PHRASE = new RegExp(
  String.raw`,?\s+(?:(?:starting|beginning|kicking off|doors open)\s+)?(?:at|from)\s+(${CLOCK})(?:\s*(?:to|until|-)\s*${CLOCK})?`,
  'gi',
);

/**
 * Start hour of a prose time phrase. A bare "1:30" in American prose is
 * ambiguous; it takes the meridiem of the range it opens ("1:30-3:30 PM" is
 * afternoon), and with none it is skipped unless it is unambiguously 24-hour
 * (13:00 and later, or a leading zero).
 */
function proseStartHour(start: string, phrase: string): number | null {
  if (/[ap]\.?\s?m\b/i.test(start)) return firstHour(start);
  const m = start.match(/^(\d{1,2}):[0-5]\d$/);
  if (!m) return null;
  const h = Number(m[1]);
  const meridiem = phrase.slice(phrase.indexOf(start) + start.length).match(/\b([ap])\.?\s?m\b/i);
  if (meridiem && h <= 12) return (h % 12) + (meridiem[1].toLowerCase() === 'p' ? 12 : 0);
  if (h >= 13 || m[1].startsWith('0')) return h;
  return null;
}

/**
 * Prose: remove a suspect time phrase from any sentence that is not about
 * nightlife. Works sentence by sentence so "bar" in one sentence does not
 * protect a parade in the next. Returns the text and the phrases removed.
 */
export function stripSuspectTimes(
  text: string,
  timezone: string | null | undefined,
): { text: string; removed: string[] } {
  if (!text || !checksLateTimes(timezone)) return { text, removed: [] };
  const removed: string[] = [];
  const out = text
    .split('\n')
    .map((line) => {
      // [[headers]] and lines without a clock are left alone.
      if (/^\s*\[\[/.test(line) || !new RegExp(CLOCK, 'i').test(line)) return line;
      return line
        .split(/(?<=[.!?])\s+(?=[A-Z\[*"'])/)
        .map((sentence) => {
          if (LATE_NIGHT_OK.test(sentence.replace(/\]\([^)]*\)/g, ']'))) return sentence;
          return sentence.replace(TIME_PHRASE, (phrase, start: string) => {
            const h = proseStartHour(start, phrase);
            if (h === null || !isSuspectHour(h)) return phrase;
            removed.push(phrase.trim());
            return '';
          });
        })
        .join(' ');
    })
    .join('\n');
  return { text: out, removed };
}
