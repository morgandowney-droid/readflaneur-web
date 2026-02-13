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
  // Real estate terms
  'closed', 'sold', 'pending', 'listed', 'active', 'studio',
  'market', 'data', 'market data', 'real estate market data',
  'year', 'ago', 'year ago', 'change', 'now',
  'median', 'sale', 'price', 'median sale price', 'price per sq ft',
  'inventory', 'active inventory', 'days', 'avg', 'average', 'avg days on market',
  'property', 'size', 'avg property size', 'top', 'listings', 'top listings',
  'recent', 'sales', 'top recent sales', 'sq', 'ft', 'sq ft',
  // Common section header words
  'real', 'estate', 'real estate',
  // Market data labels (all caps versions get lowercased)
  'median sale price now', 'price per sq ft now', 'avg property size',
  'active inventory now', 'avg days on market',
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

    // Check if any word in the merged phrase is in the never-link list
    const words = lowerMerged.split(/\s+/);
    const containsNeverLinkWord = words.some(word => NEVER_LINK_WORDS.has(word));

    const shouldSkip = isNeverLinkWord || containsNeverLinkWord || isTimeIndicator || isCommonContraction ||
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
          className="text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-neutral-300/60 hover:decoration-solid transition-all"
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
          className="text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-neutral-300/60 hover:decoration-solid transition-all"
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
  // First, convert any HTML <a> tags to markdown format for consistent handling
  // <a href="url" ...>text</a> -> [text](url)
  let cleanedContent = content
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '[$2]($1)')
    // Strip any other HTML tags that may have been generated
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|span|strong|em|b|i)[^>]*>/gi, '')
    // Preserve markdown links by converting them to a placeholder format
    // [text](url) -> {{LINK:url}}text{{/LINK}}
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '{{LINK:$2}}$1{{/LINK}}')
    // Clean content: remove citation markers and bare URLs (not in markdown format)
    .replace(/\[\[\d+\]\]/g, '')
    .replace(/(?<!\{\{LINK:)https?:\/\/\S+/g, '')
    .trim();

  // Insert paragraph breaks before section headers [[...]]
  // This ensures headers get their own line/block
  cleanedContent = cleanedContent.replace(/\s*(\[\[[^\]]+\]\])\s*/g, '\n\n$1\n\n');

  // Also insert paragraph breaks after sentences that end with ]] (header followed by content)
  cleanedContent = cleanedContent.replace(/\]\]\s+([A-Z])/g, ']]\n\n$1');

  // Split into paragraphs - handle both \n\n and single \n
  let paragraphs = cleanedContent
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // If still only one paragraph and it's long, try to split on sentence boundaries
  if (paragraphs.length === 1 && paragraphs[0].length > 500) {
    const longParagraph = paragraphs[0];
    // Split on sentence endings followed by space and capital letter, creating ~3-4 sentence paragraphs
    const sentences = longParagraph.split(/(?<=[.!?])\s+(?=[A-Z])/);
    const newParagraphs: string[] = [];
    let currentPara = '';

    for (const sentence of sentences) {
      if (currentPara.length + sentence.length > 400 && currentPara.length > 0) {
        newParagraphs.push(currentPara.trim());
        currentPara = sentence;
      } else {
        currentPara += (currentPara ? ' ' : '') + sentence;
      }
    }
    if (currentPara.trim()) {
      newParagraphs.push(currentPara.trim());
    }
    paragraphs = newParagraphs;
  }

  const pClass = 'text-fg text-[1.2rem] md:text-[1.35rem] leading-loose mb-8';
  const linkClass = 'text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-neutral-300/60 hover:decoration-solid transition-all';

  return (
    <article className="max-w-none" style={{ fontFamily: 'var(--font-body-serif)' }}>
      {paragraphs.map((paragraph, index) => {
        // Check if this is a section header (wrapped in [[ ]])
        const headerMatch = paragraph.match(/^\[\[([^\]]+)\]\]$/);
        if (headerMatch) {
          return (
            <h3 key={index} className="text-xl font-semibold text-fg mt-10 mb-6" style={{ fontFamily: 'var(--font-body-serif)' }}>
              {headerMatch[1]}
            </h3>
          );
        }

        // Process bold markers and links
        // First, extract links and replace with numbered placeholders
        const links: { url: string; text: string }[] = [];
        let processedParagraph = paragraph.replace(/\{\{LINK:(https?:\/\/[^}]+)\}\}([^{]+)\{\{\/LINK\}\}/g,
          (_, url, text) => {
            links.push({ url, text: text.replace(/\*\*/g, '') }); // Remove ** from link text
            return `{{LINKREF:${links.length - 1}}}`;
          }
        );

        // Process bold markers
        processedParagraph = processedParagraph.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Render function that handles strong tags and link refs
        const renderParts = (text: string): ReactNode[] => {
          const result: ReactNode[] = [];
          // Split by both strong tags and link references
          const parts = text.split(/(<strong>[^<]+<\/strong>|\{\{LINKREF:\d+\}\})/);

          parts.forEach((part, partIdx) => {
            const strongMatch = part.match(/<strong>([^<]+)<\/strong>/);
            const linkMatch = part.match(/\{\{LINKREF:(\d+)\}\}/);

            if (strongMatch) {
              result.push(<strong key={`strong-${partIdx}`} className="font-bold text-fg">{strongMatch[1]}</strong>);
            } else if (linkMatch) {
              const linkIdx = parseInt(linkMatch[1]);
              const link = links[linkIdx];
              if (link) {
                result.push(
                  <a
                    key={`link-${partIdx}`}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    {link.text}
                  </a>
                );
              }
            } else if (part) {
              result.push(...renderWithSearchableEntities(part, neighborhoodName, city));
            }
          });

          return result;
        };

        // Helper to render content with line breaks preserved
        const renderWithLineBreaks = (content: string, renderer: (text: string) => ReactNode[]): ReactNode[] => {
          // Split on newlines (handle both \n and markdown line breaks with trailing spaces)
          const lines = content.split(/  \n|\n/);
          const result: ReactNode[] = [];
          lines.forEach((line, lineIdx) => {
            if (lineIdx > 0) {
              result.push(<br key={`br-${lineIdx}`} />);
            }
            result.push(...renderer(line));
          });
          return result;
        };

        // If there are links or bold text, use the custom renderer
        if (links.length > 0 || processedParagraph.includes('<strong>')) {
          return (
            <p key={index} className={pClass}>
              {renderWithLineBreaks(processedParagraph, renderParts)}
            </p>
          );
        }

        // Regular paragraph with entity linking
        return (
          <p key={index} className={pClass}>
            {renderWithLineBreaks(paragraph, (text) => renderWithSearchableEntities(text, neighborhoodName, city))}
          </p>
        );
      })}
    </article>
  );
}
