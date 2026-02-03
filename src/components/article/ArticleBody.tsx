'use client';

import { ReactNode } from 'react';

// Common contractions that should NOT be linked
const COMMON_CONTRACTIONS = new Set([
  "it's", "that's", "there's", "here's", "what's", "who's", "where's", "when's",
  "he's", "she's", "let's", "how's", "why's",
  "it's", "that's", "there's", "here's", "what's", "who's", "where's", "when's",
  "he's", "she's", "let's", "how's", "why's",
]);

// Words that should NEVER be hyperlinked
const NEVER_LINK_WORDS = new Set([
  // Days and months
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
  // Nationalities, cuisines
  'thai', 'chinese', 'japanese', 'korean', 'vietnamese', 'indian', 'mexican',
  'italian', 'french', 'spanish', 'greek', 'turkish', 'lebanese', 'moroccan',
  'american', 'british', 'german', 'polish', 'russian', 'brazilian', 'peruvian',
  'mediterranean', 'asian', 'european', 'latin', 'african',
  // Street suffixes
  'ave', 'avenue', 'st', 'street', 'blvd', 'boulevard', 'rd', 'road',
  // Time indicators
  'am', 'pm', 'a.m.', 'p.m.',
]);

// Connecting words in entity names
const CONNECTING_WORDS = new Set(['du', 'de', 'von', 'van', 'the', 'at', 'of', 'und', 'och', 'and', "'s"]);

/**
 * Check if a word looks like a proper noun
 */
function looksLikeProperNoun(word: string): boolean {
  const lowerWord = word.toLowerCase();
  if (COMMON_CONTRACTIONS.has(lowerWord)) return false;
  if (/[a-z][A-Z]/.test(word)) return true; // CamelCase
  if (/^[A-Z]{2,}$/.test(word)) return true; // All caps
  if (/[À-ÖØ-öø-ÿĀ-ſ]/.test(word)) return true; // Foreign letters
  if (/\d/.test(word) && /[a-zA-Z]/.test(word)) return true; // Mixed numbers/letters
  return false;
}

/**
 * Detect street addresses
 */
function detectAddresses(text: string): { start: number; end: number; address: string }[] {
  const addresses: { start: number; end: number; address: string }[] = [];

  // US-style addresses
  const usAddressPattern = /\b(\d+\s+(?:(?:E|W|N|S|East|West|North|South)\.?\s+)?(?:\d+(?:st|nd|rd|th|ST|ND|RD|TH)|[A-Z][a-zA-Z]+)(?:\s+(?:Ave|Avenue|St|Street|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Pl|Place|Ct|Court))?\.?)\b/g;

  let match;
  while ((match = usAddressPattern.exec(text)) !== null) {
    const addressText = match[0];
    if (/^\d+\s+(AM|PM)$/i.test(addressText)) continue;
    if (/^\d+\s+(and|or|the|for|with|from|at|to|by|on|in)$/i.test(addressText)) continue;

    addresses.push({
      start: match.index,
      end: match.index + match[0].length,
      address: match[0],
    });
  }

  return addresses;
}

/**
 * Render text with searchable entities (proper nouns linked to Google Search)
 */
function renderWithSearchableEntities(
  text: string,
  neighborhoodName: string,
  city: string
): ReactNode[] {
  const results: ReactNode[] = [];
  const addresses = detectAddresses(text);

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
  let match;

  while ((match = entityPattern.exec(text)) !== null) {
    const matchedText = match[1] || match[2] || match[3];
    const isQuoted = !!match[1];
    const isCamelCase = !!match[2];
    const isAtSentenceStart = match.index === 0 || /[.!?]\s*$/.test(text.slice(0, match.index));

    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      text: isQuoted ? matchedText : match[0],
      isAtSentenceStart: isAtSentenceStart && !isCamelCase && !isQuoted,
    });
  }

  // Merge consecutive tokens
  const mergedTokens: { start: number; end: number; text: string }[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let merged = token.text;
    let endIndex = token.end;
    let startIndex = token.start;
    let isFirstAtSentenceStart = token.isAtSentenceStart;

    while (i + 1 < tokens.length) {
      const nextToken = tokens[i + 1];
      const gap = text.slice(endIndex, nextToken.start);
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

    const lowerMerged = merged.toLowerCase();
    const isSingleWord = !merged.includes(' ') && !merged.includes("'") && !merged.includes("'");
    const isNeverLinkWord = NEVER_LINK_WORDS.has(lowerMerged);
    const isCommonContraction = COMMON_CONTRACTIONS.has(lowerMerged);
    const isNeighborhoodName = lowerMerged === neighborhoodName.toLowerCase() || lowerMerged === city.toLowerCase();
    const isTimeIndicator = /^(am|pm|a\.m\.|p\.m\.)$/i.test(merged);
    const isSentenceStartCommonWord = isFirstAtSentenceStart && isSingleWord && !looksLikeProperNoun(merged);

    const shouldSkip = isNeverLinkWord || isTimeIndicator || isCommonContraction ||
                       isNeighborhoodName || isSentenceStartCommonWord;

    const overlapsAddress = addresses.some(addr =>
      (startIndex >= addr.start && startIndex < addr.end) ||
      (endIndex > addr.start && endIndex <= addr.end) ||
      (startIndex <= addr.start && endIndex >= addr.end)
    );

    if (!shouldSkip && merged.length > 1 && !overlapsAddress) {
      mergedTokens.push({ start: startIndex, end: endIndex, text: merged });
    }
  }

  // Combine addresses and entities
  type LinkItem = { start: number; end: number; text: string; type: 'entity' | 'address' };
  const allLinks: LinkItem[] = [
    ...mergedTokens.map(t => ({ ...t, type: 'entity' as const })),
    ...addresses.map(a => ({ start: a.start, end: a.end, text: a.address, type: 'address' as const })),
  ].sort((a, b) => a.start - b.start);

  // Build result
  let lastIndex = 0;

  allLinks.forEach((item, idx) => {
    if (item.start > lastIndex) {
      results.push(text.slice(lastIndex, item.start));
    }

    if (item.type === 'address') {
      const mapsQuery = encodeURIComponent(`${item.text}, ${neighborhoodName}, ${city}`);
      results.push(
        <a
          key={`addr-${idx}`}
          href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          {item.text}
        </a>
      );
    } else {
      const searchQuery = encodeURIComponent(`${neighborhoodName} ${item.text}`);
      results.push(
        <a
          key={`entity-${idx}`}
          href={`https://www.google.com/search?q=${searchQuery}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          {item.text}
        </a>
      );
    }

    lastIndex = item.end;
  });

  if (lastIndex < text.length) {
    results.push(text.slice(lastIndex));
  }

  return results.length > 0 ? results : [text];
}

interface ArticleBodyProps {
  content: string;
  neighborhoodName: string;
  city: string;
}

export function ArticleBody({ content, neighborhoodName, city }: ArticleBodyProps) {
  // Clean content: remove citation markers and URLs
  const cleanedContent = content
    .replace(/\[\[\d+\]\]/g, '')
    .replace(/\(https?:\/\/[^)]+\)/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Split into paragraphs
  const paragraphs = cleanedContent.split('\n\n').filter(p => p.trim());

  return (
    <article className="prose prose-neutral max-w-none">
      {paragraphs.map((paragraph, index) => {
        // Check if this is a section header (wrapped in [[ ]])
        const headerMatch = paragraph.match(/^\[\[([^\]]+)\]\]$/);
        if (headerMatch) {
          return (
            <h3 key={index} className="text-lg font-semibold text-neutral-800 mt-8 mb-4">
              {headerMatch[1]}
            </h3>
          );
        }

        // Process bold markers
        const processedParagraph = paragraph.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // If there's bold text, we need to handle it specially
        if (processedParagraph.includes('<strong>')) {
          // Split by strong tags and render
          const parts = processedParagraph.split(/(<strong>[^<]+<\/strong>)/);
          return (
            <p key={index} className="text-neutral-700 leading-relaxed mb-6">
              {parts.map((part, partIdx) => {
                const strongMatch = part.match(/<strong>([^<]+)<\/strong>/);
                if (strongMatch) {
                  return <strong key={partIdx}>{strongMatch[1]}</strong>;
                }
                return renderWithSearchableEntities(part, neighborhoodName, city);
              })}
            </p>
          );
        }

        // Regular paragraph with entity linking
        return (
          <p key={index} className="text-neutral-700 leading-relaxed mb-6">
            {renderWithSearchableEntities(paragraph, neighborhoodName, city)}
          </p>
        );
      })}
    </article>
  );
}
