/**
 * Hyperlink Injector
 *
 * Shared utility for injecting Google Search hyperlinks into prose content.
 * Used by both the brief enricher and cron job story generators.
 *
 * Strategy:
 * - Gemini identifies link candidates (text spans that should be hyperlinked)
 * - We construct Google Search URLs: {text} {neighborhood.name} {neighborhood.city}
 * - Inject <a> tags into the prose for each candidate
 *
 * Cost: ~$0 additional (Gemini already called, Google Search URLs are just string construction)
 */

export interface LinkCandidate {
  text: string; // Exact text to hyperlink (e.g., "Torrisi")
}

export interface NeighborhoodContext {
  name: string;
  city: string;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a Google Search URL for a given text
 *
 * @param text - The text to search for
 * @param neighborhood - The neighborhood context for location-based searches
 * @returns A Google Search URL with query: {text} {neighborhood.name} {neighborhood.city}
 */
export function buildGoogleSearchUrl(
  text: string,
  neighborhood: NeighborhoodContext
): string {
  const query = `${text} ${neighborhood.name} ${neighborhood.city}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/**
 * Inject hyperlinks into text for each link candidate
 *
 * @param text - The prose text to inject links into
 * @param candidates - Array of link candidates from Gemini
 * @param neighborhood - The neighborhood context for building URLs
 * @returns The text with markdown links [text](url) injected
 */
export function injectHyperlinks(
  text: string,
  candidates: LinkCandidate[],
  neighborhood: NeighborhoodContext
): string {
  if (!candidates || candidates.length === 0) {
    return text;
  }

  // Sort by text length descending to avoid partial replacements
  // (e.g., "Torrisi Bar & Restaurant" should be matched before "Torrisi")
  const sorted = [...candidates].sort((a, b) => b.text.length - a.text.length);

  let result = text;

  for (const candidate of sorted) {
    // Skip if text is empty or too short
    if (!candidate.text || candidate.text.length < 2) {
      continue;
    }

    const url = buildGoogleSearchUrl(candidate.text, neighborhood);

    // Build regex that:
    // 1. Uses word boundaries to avoid partial matches
    // 2. Uses negative lookbehind to avoid text already inside a markdown link
    // 3. Case-insensitive matching to handle variations
    //
    // Note: We only replace the first occurrence to avoid over-linking
    try {
      const escapedText = escapeRegex(candidate.text);

      // Pattern explanation:
      // (?<!\[) - Negative lookbehind: not preceded by [ (markdown link start)
      // \b - Word boundary
      // (escapedText) - The text to match (captured for replacement)
      // \b - Word boundary
      // (?!\]) - Negative lookahead: not followed by ] (markdown link text end)
      const regex = new RegExp(
        `(?<!\\[)\\b(${escapedText})\\b(?!\\])`,
        'i'
      );

      // Replace first occurrence only - use markdown format [text](url)
      result = result.replace(
        regex,
        `[$1](${url})`
      );
    } catch (e) {
      // If regex fails (e.g., invalid pattern), skip this candidate
      console.warn(`Hyperlink injection failed for "${candidate.text}":`, e);
    }
  }

  return sanitizeMarkdownLinks(result);
}

/**
 * Sanitize markdown links to prevent broken rendering from unencoded
 * parentheses in URLs. Gemini sometimes generates URLs containing literal
 * (PACT), (NYC), etc. which markdown parsers interpret as closing the link.
 *
 * Fixes: `[text](url...(FOO)...rest)` → `[text](url...%28FOO%29...rest)`
 */
export function sanitizeMarkdownLinks(text: string): string {
  // Match markdown links: [text](url)
  // Use a non-greedy match for the URL, handling nested parens
  return text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]*(?:\([^)]*\)[^)]*)*)\)/g,
    (_match, linkText: string, rawUrl: string) => {
      // Encode any literal parentheses inside the URL query string
      const qIndex = rawUrl.indexOf('?');
      if (qIndex === -1) return `[${linkText}](${rawUrl})`;
      const base = rawUrl.substring(0, qIndex);
      const query = rawUrl.substring(qIndex)
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29');
      return `[${linkText}](${base}${query})`;
    }
  );
}

export function validateLinkCandidates(
  candidates: unknown
): LinkCandidate[] {
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .filter((c): c is LinkCandidate => {
      return (
        typeof c === 'object' &&
        c !== null &&
        typeof (c as LinkCandidate).text === 'string' &&
        (c as LinkCandidate).text.length >= 2
      );
    })
    .map((c) => ({
      text: c.text.trim(),
    }));
}
