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

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return formatDate(date);
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
 * Strip redundant "Neighborhood DAILY BRIEF:" prefix from article headlines
 * e.g., "Östermalm DAILY BRIEF: Hockey Puck Drop" → "Hockey Puck Drop"
 */
export function cleanArticleHeadline(headline: string): string {
  // Strip patterns like "Neighborhood DAILY BRIEF:" or "Neighborhood Daily Brief:"
  let cleaned = headline.replace(/^[^:]*DAILY\s+BRIEF\s*:\s*/i, '');
  return cleaned || headline;
}

/**
 * Truncate a headline at the last full word within maxLen chars.
 * Strips trailing ", and" / ", or" if they end up at the sentence edge.
 * No ellipsis or partial words.
 */
export function truncateHeadline(text: string, maxLen: number = 45): string {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  let truncated = lastSpace > 0 ? text.slice(0, lastSpace) : slice;
  // Strip trailing conjunctions that dangle
  truncated = truncated.replace(/,\s*(?:and|or)\s*$/i, '');
  return truncated;
}

/**
 * Get day-of-week abbreviation from a date string
 * e.g., "2026-02-08T..." → "Sun"
 */
export function getDayAbbr(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}
