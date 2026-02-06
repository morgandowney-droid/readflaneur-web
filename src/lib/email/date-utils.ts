/**
 * Date utilities for weather stories
 *
 * Enforces editorial rule: NEVER say "Tomorrow" alone.
 * Always use "Tomorrow (Sat)" or the full day name "Sunday".
 */

/**
 * Get YYYY-MM-DD string for a date in a specific timezone
 */
function toLocaleDateStr(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
}

/**
 * Get the abbreviated day name (Mon, Tue, etc.) in a timezone
 */
function getDayAbbreviation(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: timezone,
  }).format(date);
}

/**
 * Get the full day name (Monday, Tuesday, etc.) in a timezone
 */
function getDayName(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: timezone,
  }).format(date);
}

/**
 * Format a future date reference relative to today.
 *
 * Rules:
 *   - Same day → "Today"
 *   - Next day → "Tomorrow (Sat)" (NEVER "Tomorrow" alone)
 *   - 2+ days out → Full day name: "Sunday", "Monday", etc.
 */
export function formatForecastDay(
  targetDate: Date,
  todayDate: Date,
  timezone: string
): string {
  const todayStr = toLocaleDateStr(todayDate, timezone);
  const targetStr = toLocaleDateStr(targetDate, timezone);

  const todayMs = new Date(todayStr).getTime();
  const targetMs = new Date(targetStr).getTime();
  const diffDays = Math.round((targetMs - todayMs) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) {
    const abbrev = getDayAbbreviation(targetDate, timezone);
    return `Tomorrow (${abbrev})`;
  }
  return getDayName(targetDate, timezone);
}

/**
 * Get the local day-of-week number in a timezone.
 * 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
 */
export function getLocalDayOfWeek(date: Date, timezone: string): number {
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const abbrev = getDayAbbreviation(date, timezone);
  return dayMap[abbrev] ?? 1;
}

/**
 * Check if today is Thursday or Friday in the given timezone.
 * Used for Priority 3 weekend lookahead.
 */
export function isThursdayOrFriday(date: Date, timezone: string): boolean {
  const dow = getLocalDayOfWeek(date, timezone);
  return dow === 4 || dow === 5;
}

/**
 * Check if tomorrow is a weekday (Mon–Fri) in the given timezone.
 * Used for Priority 2 commute check.
 */
export function isTomorrowWeekday(date: Date, timezone: string): boolean {
  const tomorrow = new Date(date.getTime() + 86400000);
  const dow = getLocalDayOfWeek(tomorrow, timezone);
  return dow >= 1 && dow <= 5;
}
