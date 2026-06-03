/**
 * Generation cadence gate (AI cost control).
 *
 * Daily content (briefs + Look Aheads) is generated for ~301 active
 * neighborhoods, but only ~12 have any subscriber. Generating daily content
 * for the ~256 "cold" neighborhoods (no subscriber, not Irish syndication) is
 * the single biggest AI cost with no reader.
 *
 * This gate keeps daily generation for subscribed neighborhoods and the 33
 * Irish syndication entities (ie-*, feeding yous.news), and drops cold
 * neighborhoods to once every COLD_INTERVAL_DAYS. A deterministic
 * per-neighborhood bucket spreads the cold set evenly across the interval
 * (~1/4 per day) instead of regenerating all of them on the same day.
 *
 * When a cold neighborhood gains its first subscriber it returns to daily
 * automatically - the gate reads live subscriber state every run.
 */

export const COLD_INTERVAL_DAYS = 7;

/** djb2 string hash - deterministic, stable across runs. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Days since the Unix epoch for a 'YYYY-MM-DD' date string. */
function dayNumber(localDate: string): number {
  return Math.floor(Date.parse(`${localDate}T00:00:00Z`) / 86_400_000);
}

/** Irish counties + national Ireland (ie-*) are syndicated to yous.news. */
export function isIrishEntity(neighborhoodId: string): boolean {
  return neighborhoodId.startsWith('ie-');
}

/**
 * A "priority" neighborhood has a real audience: it either has a subscriber or
 * is an Irish syndication entity (feeding yous.news). Priority neighborhoods get
 * the full treatment - daily generation, Grok+Gemini dual-source search, Pro
 * enrichment, Look Ahead, and the Sunday Edition. Cold (non-priority)
 * neighborhoods get a lean Gemini-only Daily Brief every COLD_INTERVAL_DAYS,
 * Flash-enriched, with no Look Ahead or Sunday Edition. Used across the
 * generation crons to match AI spend to actual demand.
 */
export function isPriorityNeighborhood(
  neighborhoodId: string,
  subscribed: boolean,
): boolean {
  return subscribed || isIrishEntity(neighborhoodId);
}

/**
 * Whether a neighborhood should have daily content generated for the given
 * local date.
 *
 * @param neighborhoodId - neighborhood ID
 * @param localDate      - the neighborhood's local date, 'YYYY-MM-DD'
 * @param subscribed     - true if the neighborhood has >=1 subscriber
 * @returns true for subscribed/Irish neighborhoods (always), or for cold
 *   neighborhoods only on their bucketed day (every COLD_INTERVAL_DAYS).
 */
export function shouldGenerateToday(
  neighborhoodId: string,
  localDate: string,
  subscribed: boolean,
): boolean {
  if (subscribed || isIrishEntity(neighborhoodId)) return true;
  return djb2(neighborhoodId) % COLD_INTERVAL_DAYS === dayNumber(localDate) % COLD_INTERVAL_DAYS;
}
