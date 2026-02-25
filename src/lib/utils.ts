import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}

export function formatDate(date: string | Date, locale: string = 'en', timezone?: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  if (timezone) opts.timeZone = timezone;
  return new Intl.DateTimeFormat(locale, opts).format(new Date(date));
}

export function formatRelativeTime(date: string | Date, locale: string = 'en', timezone?: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  // Short local date in the neighborhood's timezone (e.g., "Feb 21")
  const localDateOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (timezone) localDateOpts.timeZone = timezone;
  const localDate = new Intl.DateTimeFormat(locale, localDateOpts).format(then);

  if (diffMins < 60) {
    return timezone ? `${diffMins}m ago · ${localDate}` : `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return timezone ? `${diffHours}h ago · ${localDate}` : `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return timezone ? `${diffDays}d ago · ${localDate}` : `${diffDays}d ago`;
  } else {
    return formatDate(date, locale, timezone);
  }
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function cityToSlug(city: string): string {
  return city.toLowerCase().replace(/\s+/g, '-');
}

export function neighborhoodToSlug(id: string): string {
  // e.g., 'nyc-west-village' -> 'west-village'
  const parts = id.split('-');
  return parts.slice(1).join('-');
}

export function categoryLabelToSlug(label: string): string {
  // e.g., 'Weekly Civic Recap' -> 'weekly-civic-recap'
  return label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Title-case a short teaser string for use as a headline.
 * Capitalizes each word, but keeps small words (a, the, of, in, on, for, and, etc.)
 * lowercase unless they're the first word. Preserves intentionally-capitalized
 * tokens like "$12m" or "IKEA".
 */
export function toHeadlineCase(text: string): string {
  const small = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'in', 'on', 'at', 'to', 'of', 'by', 'is', 'vs']);
  return text
    .split(/\s+/)
    .map((word, i) => {
      // Preserve tokens that are already mixed-case or start with symbols ($12m, IKEA, de Blasio)
      if (/[A-Z]/.test(word) && /[a-z]/.test(word)) return word;
      if (/^[^a-zA-Z]/.test(word)) return word; // starts with $ or digit
      const lower = word.toLowerCase();
      if (i > 0 && small.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Strip redundant "Neighborhood DAILY BRIEF:" or "Neighborhood LOOK AHEAD:" prefix from article headlines
 * e.g., "Östermalm DAILY BRIEF: Hockey Puck Drop" → "Hockey Puck Drop"
 * e.g., "Sweden LOOK AHEAD: Gothenburg Horse Show" → "Gothenburg Horse Show"
 */
export function cleanArticleHeadline(headline: string): string {
  // Strip patterns like "Neighborhood DAILY BRIEF:" or "Neighborhood Daily Brief:"
  let cleaned = headline.replace(/^[^:]*DAILY\s+BRIEF\s*:\s*/i, '');
  // Strip patterns like "Neighborhood LOOK AHEAD:" or "Neighborhood Look Ahead:"
  cleaned = cleaned.replace(/^[^:]*LOOK\s+AHEAD\s*:\s*/i, '');
  return cleaned || headline;
}

/**
 * Truncate a headline at the last full word within maxLen chars.
 * Strips trailing prepositions, articles, conjunctions, and "St." that dangle.
 * No ellipsis or partial words.
 */
export function truncateHeadline(text: string, maxLen: number = 40): string {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  let truncated = lastSpace > 0 ? text.slice(0, lastSpace) : slice;
  // Strip trailing conjunctions with comma
  truncated = truncated.replace(/,\s*(?:and|or)\s*$/i, '');
  truncated = truncated.replace(/\s+St\.?$/i, '');
  // Strip trailing prepositions, articles, and conjunctions that look incomplete
  const danglingPattern = /\s+(?:for|in|at|on|to|of|by|with|from|into|as|the|a|an|and|or|but)\s*$/i;
  while (danglingPattern.test(truncated) && truncated.includes(' ')) {
    truncated = truncated.replace(danglingPattern, '');
  }
  return truncated;
}

/**
 * Get day-of-week abbreviation from a date string
 * e.g., "2026-02-08T..." → "Sun"
 */
export function getDayAbbr(dateString: string, locale: string = 'en'): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(locale, { weekday: 'short' });
}
