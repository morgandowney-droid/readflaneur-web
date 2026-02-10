'use client';

import { useState, ReactNode } from 'react';

interface BriefSource {
  title?: string;
  url?: string;
}

interface EnrichedStory {
  entity: string;
  source: { name: string; url: string } | null;
  context: string;
  note?: string;
  googleFallbackUrl: string;
}

interface EnrichedCategory {
  name: string;
  stories: EnrichedStory[];
}

/**
 * Render text with [[section header]] markers as bold React elements
 * Also handles legacy **bold** markers for backwards compatibility
 */
function renderWithBold(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Match both [[header]] and **bold** patterns
  const headerPattern = /\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;
  let keyIndex = 0;

  while ((match = headerPattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add the bold text (match[1] for [[]], match[2] for **)
    const boldText = match[1] || match[2];
    parts.push(
      <strong key={`bold-${keyIndex++}`} className="font-semibold">
        {boldText}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * Detect and extract section header from paragraph start
 * Rule: Title-case words (with lowercase connectors like "is", "a", "the") form the header.
 * Header ends when a capitalized word is followed by a lowercase word that is NOT a connector.
 *
 * Example: "N. Moore is Having a Moment If you haven't walked..."
 * - "is", "a" are connectors, so they're part of the title
 * - "Moment" (cap) followed by "If" (cap) = continue
 * - "If" (cap) followed by "you" (lower, not connector) = header ends before "If"
 * Result: header = "N. Moore is Having a Moment", rest = "If you haven't walked..."
 */
function extractSectionHeader(text: string): { header: string; rest: string } | null {
  // Remove any existing ** or *** markers first
  const cleanText = text.replace(/\*+/g, '');

  // Split into words while preserving spacing
  const wordPattern = /(\S+)(\s*)/g;
  const words: { word: string; spacing: string }[] = [];
  let match;

  while ((match = wordPattern.exec(cleanText)) !== null) {
    words.push({ word: match[1], spacing: match[2] });
  }

  if (words.length < 2) return null;

  // Common lowercase words allowed in titles (articles, prepositions, conjunctions, auxiliary verbs)
  // Also include & as a connector symbol
  const titleConnectors = new Set([
    'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
    'in', 'on', 'at', 'to', 'of', 'by', 'with', 'from', 'as', 'into',
    'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'has', 'have', 'had', 'do', 'does', 'did',
    'vs', 'vs.', 'via', 'per',
    '&', // ampersand connector
  ]);

  // Check case of first letter, ignoring leading punctuation/quotes
  const getFirstLetter = (word: string) => word.replace(/^["'"'«»\[\(]/, '');
  const startsWithUpper = (word: string) => /^[A-ZÄÖÅÆØÜÉÈÊËÀÂÁÃĪŌŪĒĀ]/.test(getFirstLetter(word));
  const startsWithLower = (word: string) => /^[a-zäöåæøüéèêëàâáãīōūēā]/.test(getFirstLetter(word));
  // Check if word is a connector, stripping trailing punctuation
  const isConnector = (word: string) => {
    const cleaned = word.toLowerCase().replace(/[.,!?;:]$/, '');
    return titleConnectors.has(cleaned) || cleaned === ':';
  };

  if (!startsWithUpper(words[0].word)) return null;

  // Find where header ends
  // Header includes: capitalized words + lowercase connectors
  // Header ends when a capitalized word is followed by a lowercase non-connector
  let headerEndIndex = -1;
  let lastCapitalizedIndex = 0;
  let allTitleWords = true;

  for (let i = 0; i < words.length; i++) {
    const current = words[i].word;
    const next = i + 1 < words.length ? words[i + 1].word : null;

    if (startsWithUpper(current)) {
      lastCapitalizedIndex = i;
    }

    // Check if this is a valid title word
    // A connector is only valid if followed by a capitalized word (or at end of text)
    const isValidConnector = isConnector(current) && (!next || startsWithUpper(next));
    const isValidTitleWord = startsWithUpper(current) || isValidConnector;

    if (!isValidTitleWord) {
      // Current word breaks the title pattern - header ends before it
      headerEndIndex = i - 1;
      allTitleWords = false;
      break;
    }

    // If current is capitalized and next is lowercase non-connector, header ends BEFORE current
    // Because "current" is the start of a new sentence, not part of the title
    if (next && startsWithUpper(current) && startsWithLower(next) && !isConnector(next)) {
      headerEndIndex = i - 1;
      allTitleWords = false;
      break;
    }
  }

  // If all words are title words, the entire paragraph is a header (standalone title)
  if (allTitleWords && words.length >= 2) {
    // Check if we have at least 2 capitalized words
    let capCount = 0;
    for (const w of words) {
      if (startsWithUpper(w.word)) capCount++;
    }
    if (capCount >= 2) {
      // Return the whole text as header with empty rest
      return { header: cleanText.trim(), rest: '' };
    }
  }

  // If we went through all words without finding a clear split, no header detected
  if (headerEndIndex === -1) return null;

  // Need at least 2 words with at least 2 capitalized to be a header
  let capCount = 0;
  for (let i = 0; i <= headerEndIndex; i++) {
    if (startsWithUpper(words[i].word)) capCount++;
  }
  if (headerEndIndex < 1 || capCount < 2) return null;

  // Build header and rest strings
  let header = '';
  let rest = '';

  for (let i = 0; i <= headerEndIndex; i++) {
    header += words[i].word + words[i].spacing;
  }

  for (let i = headerEndIndex + 1; i < words.length; i++) {
    rest += words[i].word + words[i].spacing;
  }

  return { header: header.trim(), rest: rest.trim() };
}

interface NeighborhoodBriefProps {
  headline: string;
  content: string;
  generatedAt: string;
  neighborhoodName: string;
  neighborhoodId?: string;
  city?: string;
  sources?: BriefSource[];
  // Gemini-enriched data (optional)
  enrichedContent?: string;
  enrichedCategories?: EnrichedCategory[];
  enrichedAt?: string;
}

// Blocked domains per neighborhood - links to these sites get replaced with Google searches
const BLOCKED_DOMAINS: Record<string, string[]> = {
  'tribeca': ['tribecacitizen.com'],
};

/**
 * Check if a URL should be blocked for a given neighborhood
 * Returns a Google search URL if blocked, otherwise returns the original URL
 */
function getFilteredUrl(
  url: string,
  linkText: string,
  neighborhoodName: string
): string {
  const neighborhoodKey = neighborhoodName.toLowerCase();
  const blockedDomains = BLOCKED_DOMAINS[neighborhoodKey] || [];

  const isBlocked = blockedDomains.some(domain =>
    url.toLowerCase().includes(domain.toLowerCase())
  );

  if (isBlocked) {
    // Replace with Google search: "[link text] [neighborhood]"
    const searchQuery = encodeURIComponent(`${linkText} ${neighborhoodName}`);
    return `https://www.google.com/search?q=${searchQuery}`;
  }

  return url;
}

// Common contractions that should NOT be linked even though they might look like proper nouns
const COMMON_CONTRACTIONS = new Set([
  "it's", "that's", "there's", "here's", "what's", "who's", "where's", "when's",
  "he's", "she's", "let's", "how's", "why's",
  // Curly apostrophe versions
  "it's", "that's", "there's", "here's", "what's", "who's", "where's", "when's",
  "he's", "she's", "let's", "how's", "why's",
]);

// Currency codes (all caps but not proper nouns)
const CURRENCY_CODES = new Set([
  'aed', 'usd', 'eur', 'gbp', 'jpy', 'cny', 'inr', 'aud', 'cad', 'chf',
  'sgd', 'hkd', 'nzd', 'sek', 'nok', 'dkk', 'krw', 'thb', 'myr', 'php',
]);

/**
 * Check if a word looks like a proper noun (not just capitalized due to sentence start)
 * Returns true if the word has characteristics suggesting it's genuinely a proper noun
 */
function looksLikeProperNoun(word: string): boolean {
  const lowerWord = word.toLowerCase();

  // Explicitly NOT proper nouns
  if (COMMON_CONTRACTIONS.has(lowerWord)) return false;
  if (CURRENCY_CODES.has(lowerWord)) return false;

  // CamelCase: has lowercase followed by uppercase like "iPhone", "PopUp"
  if (/[a-z][A-Z]/.test(word)) return true;
  // All caps (2+ letters): "PSG", "NYC", "HIIT", "UES" - but not currency codes
  if (/^[A-Z]{2,}$/.test(word)) return true;
  // Contains non-ASCII LETTERS (not punctuation like curly quotes)
  // Check for actual foreign letters, not curly apostrophes/quotes
  if (/[À-ÖØ-öø-ÿĀ-ſ]/.test(word)) return true;
  // Contains numbers mixed with letters: "16e", "92Y", "3rd"
  if (/\d/.test(word) && /[a-zA-Z]/.test(word)) return true;
  // Otherwise, a single capitalized word at sentence start is probably just grammar
  return false;
}

// Words that should NEVER be hyperlinked (months, days, nationalities/cuisines, street suffixes)
const NEVER_LINK_WORDS = new Set([
  // Days and months (full and abbreviated)
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
  'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  // Nationalities, cuisines, languages, regional descriptors
  'thai', 'chinese', 'japanese', 'korean', 'vietnamese', 'indian', 'mexican',
  'italian', 'french', 'spanish', 'greek', 'turkish', 'lebanese', 'moroccan',
  'american', 'british', 'german', 'polish', 'russian', 'brazilian', 'peruvian',
  'ethiopian', 'egyptian', 'caribbean', 'cuban', 'jamaican', 'filipino', 'indonesian',
  'malaysian', 'singaporean', 'australian', 'canadian', 'irish', 'scottish', 'swedish',
  'norwegian', 'danish', 'dutch', 'belgian', 'swiss', 'austrian', 'portuguese',
  'mediterranean', 'asian', 'european', 'latin', 'african', 'iberian', 'nordic',
  'middle eastern', 'southern', 'northern', 'eastern', 'western',
  // Middle Eastern / Arabic world
  'arabic', 'emirati', 'saudi', 'qatari', 'kuwaiti', 'bahraini', 'omani', 'yemeni',
  'iraqi', 'syrian', 'jordanian', 'palestinian', 'israeli', 'persian', 'iranian',
  // Street address suffixes (to avoid partial address linking)
  'ave', 'avenue', 'st', 'street', 'blvd', 'boulevard', 'rd', 'road', 'dr', 'drive',
  'ln', 'lane', 'way', 'pl', 'place', 'ct', 'court', 'cir', 'circle', 'pkwy', 'parkway',
  // Time indicators
  'am', 'pm', 'a.m.', 'p.m.',
]);

// Connecting words that can appear in entity names
const CONNECTING_WORDS = new Set(['du', 'de', 'von', 'van', 'the', 'at', 'of', 'und', 'och', 'i', 'på', 'and', "'s"]);

/**
 * Detect street addresses and return their positions
 * Patterns: "123 7th Ave", "500 W 18th St", "132 Broadway", "185 East 80th", "11 rue Jean de la Fontaine"
 */
function detectAddresses(text: string): { start: number; end: number; address: string }[] {
  const addresses: { start: number; end: number; address: string }[] = [];

  // Pattern 1: US-style addresses (NO case-insensitive flag - must have proper capitalization)
  // - Number + optional direction (E/W/N/S or East/West/North/South) + street name/number + optional suffix
  // Examples: "132 7th Ave", "500 W 18th", "123 Broadway", "45 E 20th St", "185 East 80th"
  // Note: ordinals use (?:st|nd|rd|th|ST|ND|RD|TH) to handle both cases without 'i' flag
  const usAddressPattern = /\b(\d+\s+(?:(?:E|W|N|S|East|West|North|South)\.?\s+)?(?:\d+(?:st|nd|rd|th|ST|ND|RD|TH)|[A-Z][a-zA-Z]+)(?:\s+(?:Ave|Avenue|AVE|AVENUE|St|Street|ST|STREET|Blvd|Boulevard|BLVD|BOULEVARD|Rd|Road|RD|ROAD|Dr|Drive|DR|DRIVE|Ln|Lane|LN|LANE|Way|WAY|Pl|Place|PL|PLACE|Ct|Court|CT|COURT))?\.?)\b/g;

  // Pattern 2: European-style addresses (French, German, etc.)
  // - Number + street type word + street name (multiple words including connectors)
  // Examples: "11 rue Jean de la Fontaine", "45 avenue des Champs-Élysées", "8 place de la Concorde"
  // The pattern captures: number + street type + up to 6 words (names + connectors like de, la, du)
  const euroAddressPattern = /\b(\d+\s+(?:rue|Rue|avenue|Avenue|boulevard|Boulevard|place|Place|passage|Passage|allée|Allée|impasse|Impasse|quai|Quai|chemin|Chemin|via|Via|calle|Calle|strasse|Strasse|straße|Straße|gasse|Gasse|platz|Platz|väg|Väg|gatan|Gatan|vägen|Vägen)\s+(?:[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*\s*){1,6})\b/g;

  let match;

  // Words that should NOT be treated as street names in addresses
  const notStreetNames = /^(AM|PM|and|or|the|for|with|from|at|to|by|on|in)$/i;

  // Find US-style addresses
  while ((match = usAddressPattern.exec(text)) !== null) {
    // Extract what would be the "street name" part and check if it's actually a time/common word
    const addressText = match[0];
    // Check if this looks like a time (e.g., "7 PM", "30 AM") rather than an address
    if (/^\d+\s+(AM|PM)$/i.test(addressText)) continue;
    // Check if it's just a number + common word
    if (/^\d+\s+(and|or|the|for|with|from|at|to|by|on|in)$/i.test(addressText)) continue;

    addresses.push({
      start: match.index,
      end: match.index + match[0].length,
      address: match[0],
    });
  }

  // Find European-style addresses
  while ((match = euroAddressPattern.exec(text)) !== null) {
    // Check if this overlaps with an existing address
    const overlaps = addresses.some(addr =>
      (match!.index >= addr.start && match!.index < addr.end) ||
      (match!.index + match![0].length > addr.start && match!.index + match![0].length <= addr.end)
    );
    if (!overlaps) {
      addresses.push({
        start: match.index,
        end: match.index + match[0].length,
        address: match[0].trim(),
      });
    }
  }

  return addresses;
}

/**
 * Find an enriched source for an entity by matching against enriched categories
 */
function findEnrichedSource(
  entityText: string,
  enrichedCategories?: EnrichedCategory[]
): { name: string; url: string } | null {
  if (!enrichedCategories) return null;

  const lowerEntity = entityText.toLowerCase();

  for (const category of enrichedCategories) {
    for (const story of category.stories) {
      // Match if entity text appears in the story's entity name
      const storyEntityLower = story.entity.toLowerCase();
      if (
        storyEntityLower.includes(lowerEntity) ||
        lowerEntity.includes(storyEntityLower.split('(')[0].trim())
      ) {
        return story.source;
      }
    }
  }
  return null;
}

/**
 * Detect proper nouns and make them tappable for search
 * Returns { elements: ReactNode[], hasEntities: boolean, verifiedCount: number }
 */
function renderWithSearchableEntities(
  text: string,
  neighborhoodName: string,
  city: string,
  sources?: BriefSource[],
  enrichedCategories?: EnrichedCategory[]
): { elements: ReactNode[]; hasEntities: boolean; verifiedCount: number } {
  const results: ReactNode[] = [];

  // First, detect addresses
  const addresses = detectAddresses(text);

  // Pattern matches:
  // 1. Quoted phrases: "Something Like This"
  // 2. CamelCase words: PopUp, iPhone (has internal capitals)
  // 3. Regular capitalized words (including unicode: Ö, Å, Ä, É, macrons ē, ō, etc.)
  // Extended unicode: standard accents + macrons + other diacritics
  const upperChars = 'A-ZÄÖÅÆØÜÉÈÊËÀÂÁÃĪŌŪĒĀÎÏÌÍÔÕÒÓÛÙÚÑÇ';
  const lowerChars = 'a-zäöåæøüéèêëàâáãīōūēāîïìíôõòóûùúñçē';
  const entityPattern = new RegExp(
    `"([^"]+)"|([${upperChars}][${lowerChars}]*(?:[${upperChars}][${lowerChars}']*)+)|([${upperChars}][${lowerChars}']*)`,
    'g'
  );

  interface Token {
    start: number;
    end: number;
    text: string;
    isAtSentenceStart: boolean;
  }

  const tokens: Token[] = [];

  // First pass: find ALL capitalized words (don't skip yet)
  let match;
  while ((match = entityPattern.exec(text)) !== null) {
    const matchedText = match[1] || match[2] || match[3];
    const isQuoted = !!match[1];
    const isCamelCase = !!match[2];

    const isAtSentenceStart = match.index === 0 ||
      /[.!?]\s*$/.test(text.slice(0, match.index));

    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      text: isQuoted ? matchedText : match[0], // For quoted, use inner text; otherwise full match
      isAtSentenceStart: isAtSentenceStart && !isCamelCase && !isQuoted,
    });
  }

  // Second pass: merge consecutive tokens and decide what to keep
  const mergedTokens: { start: number; end: number; text: string }[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let merged = token.text;
    let endIndex = token.end;
    let startIndex = token.start;
    let isFirstAtSentenceStart = token.isAtSentenceStart;

    // Look ahead to merge with following tokens
    while (i + 1 < tokens.length) {
      const nextToken = tokens[i + 1];
      const gap = text.slice(endIndex, nextToken.start);

      // Check if we should merge: gap is small and is space, apostrophe, or connecting word
      const gapTrimmed = gap.trim().toLowerCase();
      const shouldMerge = gap.length <= 5 && (
        gap.trim() === '' ||
        gap.trim() === "'" ||
        gap.trim() === "'s" ||
        CONNECTING_WORDS.has(gapTrimmed)
      );

      if (shouldMerge) {
        merged += gap + nextToken.text;
        endIndex = nextToken.end;
        i++;
      } else {
        break;
      }
    }

    // Now decide if we should keep this entity
    const lowerMerged = merged.toLowerCase();
    // Check for single word (no spaces, and not a possessive/contraction with apostrophe)
    const hasApostrophe = merged.includes("'") || merged.includes("'"); // straight or curly
    const isSingleWord = !merged.includes(' ') && !hasApostrophe;
    const isNeverLinkWord = NEVER_LINK_WORDS.has(lowerMerged);
    // Also check if it's a common contraction
    const isCommonContraction = COMMON_CONTRACTIONS.has(lowerMerged);
    const isNeighborhoodName = lowerMerged === neighborhoodName.toLowerCase() ||
      lowerMerged === city.toLowerCase();
    // Explicit check for time indicators (AM/PM can match as CamelCase)
    const isTimeIndicator = /^(am|pm|a\.m\.|p\.m\.)$/i.test(merged);

    // Smart sentence-start detection:
    // Single words at sentence start are capitalized due to grammar, not because they're proper nouns
    // Only link them if they have characteristics of actual proper nouns
    const isSentenceStartCommonWord = isFirstAtSentenceStart &&
      isSingleWord &&
      !looksLikeProperNoun(merged);

    // Skip if: never-link word (months/days/nationalities), time indicator,
    // common contraction, neighborhood/city name, or common word at sentence start
    const shouldSkip = isNeverLinkWord ||
      isTimeIndicator ||
      isCommonContraction ||
      isNeighborhoodName ||
      isSentenceStartCommonWord;

    // Check if this token overlaps with any address
    const overlapsAddress = addresses.some(addr =>
      (startIndex >= addr.start && startIndex < addr.end) ||
      (endIndex > addr.start && endIndex <= addr.end) ||
      (startIndex <= addr.start && endIndex >= addr.end)
    );

    if (!shouldSkip && merged.length > 1 && !overlapsAddress) {
      mergedTokens.push({
        start: startIndex,
        end: endIndex,
        text: merged,
      });
    }
  }

  // Combine addresses and entities into linkable items
  type LinkItem = { start: number; end: number; text: string; type: 'entity' | 'address' };
  const allLinks: LinkItem[] = [
    ...mergedTokens.map(t => ({ ...t, type: 'entity' as const })),
    ...addresses.map(a => ({ start: a.start, end: a.end, text: a.address, type: 'address' as const })),
  ].sort((a, b) => a.start - b.start);

  // Third pass: build result with plain text and linked spans
  let lastIndex = 0;
  let verifiedCount = 0;

  allLinks.forEach((item, idx) => {
    if (item.start > lastIndex) {
      results.push(text.slice(lastIndex, item.start));
    }

    if (item.type === 'address') {
      // Link addresses to Google Maps
      const mapsQuery = encodeURIComponent(`${item.text}, ${neighborhoodName}, ${city}`);
      results.push(
        <a
          key={`addr-${idx}`}
          href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-neutral-300/60 hover:decoration-solid transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {item.text}
        </a>
      );
    } else {
      // Check for enriched source
      const enrichedSource = findEnrichedSource(item.text, enrichedCategories);

      // When we have enriched data, only link entities with verified sources
      // When no enriched data, fall back to Google Search links
      if (enrichedSource) {
        verifiedCount++;
        // Filter URL through blocked domains check
        const filteredUrl = getFilteredUrl(enrichedSource.url, item.text, neighborhoodName);
        const isFiltered = filteredUrl !== enrichedSource.url;
        results.push(
          <a
            key={`entity-${idx}`}
            href={filteredUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-neutral-300/60 hover:decoration-solid transition-all"
            onClick={(e) => e.stopPropagation()}
            title={isFiltered ? `Search: ${item.text} ${neighborhoodName}` : `Source: ${enrichedSource.name}`}
          >
            {item.text}
          </a>
        );
      } else if (!enrichedCategories) {
        // No enriched data available - fall back to Google Search
        const searchQuery = encodeURIComponent(`${neighborhoodName} ${item.text}`);
        results.push(
          <a
            key={`entity-${idx}`}
            href={`https://www.google.com/search?q=${searchQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-neutral-300/60 hover:decoration-solid transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            {item.text}
          </a>
        );
      } else {
        // Has enriched data but no match - just render as plain text
        results.push(item.text);
      }
    }

    lastIndex = item.end;
  });

  if (lastIndex < text.length) {
    results.push(text.slice(lastIndex));
  }

  const hasEntities = allLinks.length > 0;

  // If no entities found and no enriched data, add a "more" link
  // Skip this when we have enriched data - we don't need fallback links
  if (!hasEntities && !enrichedCategories) {
    const sourceWithUrl = sources?.find(s => s.url);
    const searchText = text.slice(0, 100).trim();
    const moreUrl = sourceWithUrl?.url ||
      `https://www.google.com/search?q=${encodeURIComponent(`${neighborhoodName} ${searchText}`)}`;

    results.push(
      <span key="more-link">
        {' '}
        <a
          href={moreUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-500 hover:text-neutral-300 text-xs underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-solid transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          (more)
        </a>
      </span>
    );
  }

  return { elements: results.length > 0 ? results : [text], hasEntities, verifiedCount };
}

/**
 * Clean content by removing citation markers, inline URLs, and HTML tags
 * Uses citation positions to create natural paragraph breaks
 * Removes em dashes (AI-generated content indicator)
 */
function cleanContent(text: string): string {
  return text
    // Strip HTML <a> tags but keep the link text
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '$2')
    // Strip other common HTML tags
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|span|strong|em|b|i)[^>]*>/gi, '')
    // Elegant word replacements (avoid trying-too-hard language)
    .replace(/\bclassy\b/gi, 'tasteful')
    .replace(/\bfoodie\b/gi, 'gastronome')
    .replace(/\bfoodies\b/gi, 'gastronomes')
    // Replace citations with paragraph breaks (citations often mark topic transitions)
    .replace(/\[\[\d+\]\]\([^)]+\)\s*/g, '\n\n')
    // Remove any remaining standalone citation markers
    .replace(/\[\[\d+\]\]\s*/g, '\n\n')
    // Remove parenthetical URLs
    .replace(/\(https?:\/\/[^)]+\)/g, '')
    // Remove bare URLs
    .replace(/https?:\/\/\S+/g, '')
    // Replace em dashes with period and space (cleaner sentence break)
    .replace(/\s*—\s*/g, '. ')
    // Fix any double periods that may result
    .replace(/\.\.\s*/g, '. ')
    // Clean up multiple spaces (but not newlines)
    .replace(/ {2,}/g, ' ')
    // Clean up spaces before punctuation
    .replace(/\s+([.,!?])/g, '$1')
    // Clean up multiple newlines (but keep paragraph breaks)
    .replace(/\n{3,}/g, '\n\n')
    // Trim spaces from start of lines (preserve newlines)
    .replace(/\n +/g, '\n')
    .trim();
}

function formatTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) {
    return 'Just now';
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

export function NeighborhoodBrief({
  headline,
  content,
  generatedAt,
  neighborhoodName,
  neighborhoodId,
  city = '',
  sources = [],
  enrichedContent,
  enrichedCategories,
}: NeighborhoodBriefProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Use enriched content if available, otherwise fall back to original
  const displayContent = enrichedContent || content;
  const hasEnrichedSources = enrichedCategories && enrichedCategories.length > 0;

  // Count verified sources
  const verifiedSourceCount = hasEnrichedSources
    ? enrichedCategories.reduce(
        (sum, cat) => sum + cat.stories.filter(s => s.source !== null).length,
        0
      )
    : 0;

  // Clean content and split into paragraphs
  const cleanedContent = cleanContent(displayContent);
  const paragraphs = cleanedContent.split('\n\n').filter(p => p.trim());
  const previewText = paragraphs[0] || cleanedContent;
  const hasMore = paragraphs.length > 1 || cleanedContent.length > 300;

  // Check if a paragraph is a commentary line (short question or closing remark)
  const isCommentaryLine = (text: string, isLast: boolean) => {
    const trimmed = text.trim();
    // Commentary lines are usually: last paragraph, short, often questions
    const isQuestion = trimmed.endsWith('?');
    const isShort = trimmed.length < 80;
    return isLast && (isQuestion || isShort);
  };

  // Render paragraph with tappable entities and bold formatting
  // Strategy: Use explicit [[header]] or **bold** markers, then process for entities
  const renderParagraph = (text: string, isLast: boolean = false) => {
    if (isCommentaryLine(text, isLast)) {
      // Commentary lines: just render with bold, no entity links
      return renderWithBold(text);
    }

    // Check for explicit [[header]] or **bold** markers
    const headerPattern = /\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*/g;
    const segments: { text: string; isBold: boolean }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = headerPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: text.slice(lastIndex, match.index), isBold: false });
      }
      // match[1] for [[]], match[2] for **
      segments.push({ text: match[1] || match[2], isBold: true });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      segments.push({ text: text.slice(lastIndex), isBold: false });
    }

    // If markers were found, process each segment
    if (segments.length > 1 || (segments.length === 1 && segments[0].isBold)) {
      const result: ReactNode[] = [];
      segments.forEach((segment, segIdx) => {
        if (segment.isBold) {
          const { elements } = renderWithSearchableEntities(
            segment.text,
            neighborhoodName,
            city,
            sources,
            enrichedCategories
          );
          result.push(
            <strong key={`bold-seg-${segIdx}`} className="font-semibold">
              {elements}
            </strong>
          );
        } else if (segment.text.trim()) {
          const { elements } = renderWithSearchableEntities(
            segment.text,
            neighborhoodName,
            city,
            sources,
            enrichedCategories
          );
          result.push(...elements);
        }
      });
      return result;
    }

    // Fallback: Try auto-detection for legacy content without markers
    const headerResult = extractSectionHeader(text);
    if (headerResult) {
      const result: ReactNode[] = [];
      const { elements: headerElements } = renderWithSearchableEntities(
        headerResult.header,
        neighborhoodName,
        city,
        sources,
        enrichedCategories
      );
      result.push(
        <strong key="header" className="font-semibold">
          {headerElements}
        </strong>
      );
      if (headerResult.rest) {
        result.push(' ');
        const { elements: restElements } = renderWithSearchableEntities(
          headerResult.rest,
          neighborhoodName,
          city,
          sources,
          enrichedCategories
        );
        result.push(...restElements);
      }
      return result;
    }

    // No markers and no auto-detected header - just process for entities
    const { elements } = renderWithSearchableEntities(
      text,
      neighborhoodName,
      city,
      sources,
      enrichedCategories
    );
    return elements;
  };

  return (
    <div className="bg-surface p-5 md:p-6 mb-3">
      {/* Eyebrow + Live Dot */}
      <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-amber-600/80 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        <span>
          {(() => {
            const d = new Date(generatedAt);
            const weekday = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
            const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
            const date = d.getDate();
            return `${weekday} ${month} ${date} | DAILY BRIEF`;
          })()}
        </span>
      </div>

      {/* Headline */}
      <h3 className="font-display text-2xl md:text-3xl text-neutral-100 leading-tight mb-4">
        {headline}
      </h3>

      {/* Content */}
      <div className="text-lg text-neutral-400 leading-relaxed max-w-prose">
        {isExpanded ? (
          <div className="space-y-4">
            {paragraphs.map((p, i) => (
              <p key={i}>{renderParagraph(p, i === paragraphs.length - 1)}</p>
            ))}
            <button
              onClick={() => setIsExpanded(false)}
              className="inline text-sm font-medium text-neutral-400 hover:text-white transition-colors"
            >
              Show less
            </button>
          </div>
        ) : (
          <p>
            {renderParagraph(previewText, paragraphs.length === 1)}
            {hasMore && (
              <>
                {' '}
                <button
                  onClick={() => setIsExpanded(true)}
                  className="inline text-sm font-medium text-neutral-400 hover:text-white transition-colors"
                >
                  Read more &rsaquo;
                </button>
              </>
            )}
          </p>
        )}
      </div>

      {/* Source attribution - only show when expanded */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-white/[0.08]">
          {hasEnrichedSources ? (
            <p className="text-[10px] text-neutral-400 leading-relaxed">
              <span className="italic">Synthesized from reporting by </span>
              {(() => {
                // Collect unique sources with URLs from enriched categories
                const uniqueSources = new Map<string, { name: string; url: string }>();
                enrichedCategories.forEach(cat => {
                  cat.stories.forEach(story => {
                    if (story.source && story.source.url && !uniqueSources.has(story.source.name)) {
                      uniqueSources.set(story.source.name, story.source);
                    }
                  });
                });
                const sourceList = Array.from(uniqueSources.values());

                return sourceList.map((source, index) => {
                  const isLast = index === sourceList.length - 1;
                  const prefix = index === 0 ? '' : isLast ? ' and ' : ', ';
                  return (
                    <span key={source.name}>
                      {prefix}
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-neutral-300/60 hover:decoration-solid transition-all"
                      >
                        {source.name}
                      </a>
                    </span>
                  );
                });
              })()}
              <span className="italic">.</span>
            </p>
          ) : (
            <p className="text-[10px] text-neutral-400 italic">
              Synthesized from public news sources and social media via AI-powered search and analysis.
            </p>
          )}
        </div>
      )}

    </div>
  );
}

export function NeighborhoodBriefSkeleton() {
  return (
    <div className="bg-surface p-5 md:p-6 mb-3 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full bg-neutral-800" />
        <div className="h-3 w-28 bg-neutral-800 rounded" />
      </div>
      <div className="h-7 w-3/4 bg-neutral-800 rounded mb-4" />
      <div className="space-y-2 max-w-prose">
        <div className="h-3 w-full bg-neutral-800 rounded" />
        <div className="h-3 w-5/6 bg-neutral-800 rounded" />
        <div className="h-3 w-4/6 bg-neutral-800 rounded" />
      </div>
    </div>
  );
}

interface ArchivedBrief {
  id: string;
  headline: string;
  content: string;
  generated_at: string;
  sources?: BriefSource[];
  enriched_content?: string;
  enriched_categories?: EnrichedCategory[];
  enriched_at?: string;
}

/**
 * Format date as "Monday, Feb 3"
 */
function formatArchiveDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

interface BriefArchiveProps {
  neighborhoodId: string;
  neighborhoodName: string;
  city: string;
  currentBriefId?: string;
}

/**
 * Compact archived brief card with enriched content support
 */
function ArchivedBriefCard({
  brief,
  neighborhoodName,
  city,
}: {
  brief: ArchivedBrief;
  neighborhoodName: string;
  city: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Use enriched content if available, otherwise fall back to original
  const displayContent = brief.enriched_content || brief.content;
  const cleanedContent = cleanContent(displayContent);
  const paragraphs = cleanedContent.split('\n\n').filter(p => p.trim());
  const previewText = paragraphs[0]?.slice(0, 150) + (paragraphs[0]?.length > 150 ? '...' : '');

  // Render paragraph with bold headers and entity linking
  const renderParagraph = (text: string, isLast: boolean = false) => {
    // Check for [[header]] or **bold** markers
    const headerPattern = /\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*/g;
    const segments: { text: string; isBold: boolean }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = headerPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: text.slice(lastIndex, match.index), isBold: false });
      }
      segments.push({ text: match[1] || match[2], isBold: true });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      segments.push({ text: text.slice(lastIndex), isBold: false });
    }

    if (segments.length > 1 || (segments.length === 1 && segments[0].isBold)) {
      const result: ReactNode[] = [];
      segments.forEach((segment, segIdx) => {
        if (segment.isBold) {
          const { elements } = renderWithSearchableEntities(
            segment.text, neighborhoodName, city, brief.sources, brief.enriched_categories
          );
          result.push(<strong key={`b-${segIdx}`} className="font-semibold">{elements}</strong>);
        } else if (segment.text.trim()) {
          const { elements } = renderWithSearchableEntities(
            segment.text, neighborhoodName, city, brief.sources, brief.enriched_categories
          );
          result.push(...elements);
        }
      });
      return result;
    }

    const { elements } = renderWithSearchableEntities(
      text, neighborhoodName, city, brief.sources, brief.enriched_categories
    );
    return elements;
  };

  return (
    <div className="border-l-2 border-amber-200 pl-3 py-3">
      {/* Date header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-amber-700">
            {formatArchiveDate(brief.generated_at)}
          </span>
          <span className="text-[9px] bg-amber-100 text-amber-600 px-1 py-0.5 rounded">
            AI-Synthesized
          </span>
        </div>
        {brief.enriched_at && (
          <span className="text-[10px] text-amber-500">verified</span>
        )}
      </div>

      {/* Headline */}
      <h4 className="font-medium text-sm text-neutral-200 mb-1">
        {brief.headline}
      </h4>

      {/* Content */}
      <div className="text-xs text-neutral-400 leading-relaxed">
        {isExpanded ? (
          <div className="space-y-2">
            {paragraphs.map((p, i) => (
              <p key={i}>{renderParagraph(p, i === paragraphs.length - 1)}</p>
            ))}
          </div>
        ) : (
          <p>{previewText}</p>
        )}
      </div>

      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-2 text-xs text-amber-600 hover:text-amber-800"
      >
        {isExpanded ? 'Show less' : 'Read more'}
      </button>

      {/* Source attribution - per editorial standards */}
      {isExpanded && brief.enriched_categories && brief.enriched_categories.length > 0 && (
        <div className="mt-2 pt-2 border-t border-amber-100">
          <p className="text-[9px] text-amber-500 leading-relaxed">
            <span className="italic">Sources: </span>
            {(() => {
              const uniqueSources = new Map<string, { name: string; url: string }>();
              brief.enriched_categories.forEach(cat => {
                cat.stories.forEach(story => {
                  if (story.source && story.source.url && !uniqueSources.has(story.source.name)) {
                    uniqueSources.set(story.source.name, story.source);
                  }
                });
              });
              const sourceList = Array.from(uniqueSources.values());
              return sourceList.map((source, index) => {
                const isLast = index === sourceList.length - 1;
                const prefix = index === 0 ? '' : isLast ? ' and ' : ', ';
                return (
                  <span key={source.name}>
                    {prefix}
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-neutral-300/60 hover:decoration-solid transition-all"
                    >
                      {source.name}
                    </a>
                  </span>
                );
              });
            })()}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Brief archive with load more functionality
 */
export function BriefArchive({
  neighborhoodId,
  neighborhoodName,
  city,
  currentBriefId,
}: BriefArchiveProps) {
  const [briefs, setBriefs] = useState<ArchivedBrief[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  const loadBriefs = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const offset = briefs.length;
      const response = await fetch(
        `/api/briefs/archive?neighborhoodId=${neighborhoodId}&offset=${offset}&limit=5${currentBriefId ? `&exclude=${currentBriefId}` : ''}`
      );
      const data = await response.json();

      if (data.briefs) {
        setBriefs(prev => [...prev, ...data.briefs]);
        setHasMore(data.hasMore);
      }
    } catch (error) {
      console.error('Failed to load archived briefs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = () => {
    if (!isVisible && briefs.length === 0) {
      loadBriefs();
    }
    setIsVisible(!isVisible);
  };

  return (
    <div>
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 text-xs text-neutral-400 hover:text-neutral-900 transition-colors"
      >
        <span className="text-[10px]">{isVisible ? '▼' : '▶'}</span>
        <span>Previous days</span>
      </button>

      {isVisible && (
        <div className="mt-3 space-y-3">
          {briefs.map((brief) => (
            <ArchivedBriefCard
              key={brief.id}
              brief={brief}
              neighborhoodName={neighborhoodName}
              city={city}
            />
          ))}

          {isLoading && (
            <div className="text-xs text-neutral-400 py-2">Loading...</div>
          )}

          {!isLoading && hasMore && briefs.length > 0 && (
            <button
              onClick={loadBriefs}
              className="text-xs text-neutral-400 hover:text-neutral-900 py-1"
            >
              Load more briefs
            </button>
          )}

          {!isLoading && briefs.length === 0 && (
            <p className="text-xs text-neutral-500 py-2">No archived briefs yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
