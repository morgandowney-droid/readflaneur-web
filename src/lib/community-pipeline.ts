/**
 * Community Pipeline Utilities
 *
 * Shared helpers for creating community neighborhoods and their content.
 * Extracted from generate-brief-articles cron for reuse.
 */

/**
 * Generate a deterministic slug for a brief article.
 * Uses date + headline text (no random components) for dedup compatibility.
 */
export function generateBriefArticleSlug(headline: string, neighborhoodSlug: string): string {
  const date = new Date().toISOString().split('T')[0];
  const headlineSlug = headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  return `${neighborhoodSlug}-brief-${date}-${headlineSlug}`;
}

/**
 * Generate preview text from brief/article content.
 * Strips markdown formatting and truncates to ~200 chars.
 */
export function generatePreviewText(content: string): string {
  const cleaned = content
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
  return cleaned.substring(0, 200) + (cleaned.length > 200 ? '...' : '');
}

/**
 * Generate a deterministic community neighborhood ID from city and name.
 * Format: "city-name" in slug form (e.g., "paris-montmartre", "london-notting-hill").
 */
export function generateCommunityId(city: string, name: string): string {
  const slugify = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  return `${slugify(city)}-${slugify(name)}`;
}
