'use client';

import { useState, ReactNode } from 'react';

interface BriefSource {
  title?: string;
  url?: string;
}

interface NeighborhoodBriefProps {
  headline: string;
  content: string;
  generatedAt: string;
  neighborhoodName: string;
  city?: string;
  sources?: BriefSource[];
}

// Common words to skip ONLY if they're alone at sentence start
const SKIP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'but', 'or', 'so', 'yet', 'for', 'nor',
  'in', 'on', 'at', 'to', 'from', 'with', 'by', 'about', 'into',
  'meanwhile', 'however', 'therefore', 'furthermore', 'moreover',
  'no', 'yes', 'not', 'also', 'just', 'even', 'still', 'already',
  'recent', 'quiet', 'folks', 'today', 'tomorrow', 'events', 'fresh',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
  'village', 'tragic', 'weigh', 'mark',
]);

// Connecting words that can appear in entity names
const CONNECTING_WORDS = new Set(['du', 'de', 'von', 'van', 'the', 'at', 'of', 'und', 'och', 'i', 'på', 'and', "'s"]);

/**
 * Detect proper nouns and make them tappable for search
 * Returns { elements: ReactNode[], hasEntities: boolean }
 */
function renderWithSearchableEntities(
  text: string,
  neighborhoodName: string,
  city: string,
  sources?: BriefSource[]
): { elements: ReactNode[]; hasEntities: boolean } {
  const results: ReactNode[] = [];

  // Pattern matches:
  // 1. Quoted phrases: "Something Like This"
  // 2. CamelCase words: PopUp, iPhone (has internal capitals)
  // 3. Regular capitalized words (including unicode like Ö, Å, Ä, É)
  const entityPattern = /"([^"]+)"|([A-ZÄÖÅÆØÜÉ][a-zäöåæøüé]*(?:[A-ZÄÖÅÆØÜÉ][a-zäöåæøüé']*)+)|([A-ZÄÖÅÆØÜÉ][a-zäöåæøüé']*)/g;

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
    const isSingleWord = !merged.includes(' ') && !merged.includes("'");
    const isSkipWord = SKIP_WORDS.has(lowerMerged);
    const isNeighborhoodName = lowerMerged === neighborhoodName.toLowerCase() ||
      lowerMerged === city.toLowerCase();

    // Skip if: single common word at sentence start, or it's the neighborhood/city name
    const shouldSkip = (isFirstAtSentenceStart && isSingleWord && isSkipWord) || isNeighborhoodName;

    if (!shouldSkip && merged.length > 1) {
      mergedTokens.push({
        start: startIndex,
        end: endIndex,
        text: merged,
      });
    }
  }

  // Third pass: build result with plain text and entity spans
  let lastIndex = 0;
  mergedTokens.forEach((token, idx) => {
    if (token.start > lastIndex) {
      results.push(text.slice(lastIndex, token.start));
    }

    const searchQuery = encodeURIComponent(`${token.text} ${neighborhoodName} ${city}`);
    results.push(
      <a
        key={`entity-${idx}`}
        href={`https://www.google.com/search?q=${searchQuery}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-800 underline decoration-amber-300 decoration-1 underline-offset-2 hover:decoration-amber-500 hover:text-amber-900 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {token.text}
      </a>
    );

    lastIndex = token.end;
  });

  if (lastIndex < text.length) {
    results.push(text.slice(lastIndex));
  }

  const hasEntities = mergedTokens.length > 0;

  // If no entities found, add a "more" link (use source URL or Google search fallback)
  if (!hasEntities) {
    const sourceWithUrl = sources?.find(s => s.url);
    const moreUrl = sourceWithUrl?.url ||
      `https://www.google.com/search?q=${encodeURIComponent(`${neighborhoodName} ${city} news today`)}`;

    results.push(
      <span key="more-link">
        {' '}
        <a
          href={moreUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-600 hover:text-amber-800 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          (more)
        </a>
      </span>
    );
  }

  return { elements: results.length > 0 ? results : [text], hasEntities };
}

/**
 * Clean content by removing citation markers and inline URLs
 * Uses citation positions to create natural paragraph breaks
 * Removes em dashes (AI-generated content indicator)
 */
function cleanContent(text: string): string {
  return text
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
  city = '',
  sources = [],
}: NeighborhoodBriefProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Clean content and split into paragraphs
  const cleanedContent = cleanContent(content);
  const paragraphs = cleanedContent.split('\n\n').filter(p => p.trim());
  const previewText = paragraphs[0] || cleanedContent;
  const hasMore = paragraphs.length > 1 || cleanedContent.length > 300;

  // Render paragraph with tappable entities
  const renderParagraph = (text: string) => {
    const { elements } = renderWithSearchableEntities(text, neighborhoodName, city, sources);
    return elements;
  };

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">&#x1F4E1;</span>
          <span className="text-xs font-medium uppercase tracking-wider text-amber-700">
            What&apos;s Happening
          </span>
        </div>
        <span className="text-xs text-amber-600">
          {formatTime(generatedAt)}
        </span>
      </div>

      {/* Headline */}
      <h3 className="font-semibold text-base mb-2 text-neutral-900">
        {headline}
      </h3>

      {/* Content */}
      <div className="text-sm text-neutral-700 leading-relaxed">
        {isExpanded ? (
          <div className="space-y-4">
            {paragraphs.map((p, i) => (
              <p key={i}>{renderParagraph(p)}</p>
            ))}
          </div>
        ) : (
          <p>{renderParagraph(previewText)}</p>
        )}
      </div>

      {/* Expand/Collapse button */}
      {hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
        >
          {isExpanded ? 'Show less' : 'Read more'}
        </button>
      )}

      {/* Source attribution */}
      <div className="mt-3 pt-2 border-t border-amber-200">
        <p className="text-[10px] text-amber-600">
          Powered by Flaneur real-time local intel
        </p>
      </div>
    </div>
  );
}

export function NeighborhoodBriefSkeleton() {
  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4 mb-6 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 bg-amber-200 rounded" />
        <div className="h-3 w-24 bg-amber-200 rounded" />
      </div>
      <div className="h-5 w-3/4 bg-amber-200 rounded mb-2" />
      <div className="space-y-2">
        <div className="h-3 w-full bg-amber-100 rounded" />
        <div className="h-3 w-5/6 bg-amber-100 rounded" />
        <div className="h-3 w-4/6 bg-amber-100 rounded" />
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
}

interface BriefArchiveProps {
  neighborhoodId: string;
  neighborhoodName: string;
  city: string;
  currentBriefId?: string;
}

/**
 * Compact archived brief card
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
  const cleanedContent = cleanContent(brief.content);
  const paragraphs = cleanedContent.split('\n\n').filter(p => p.trim());
  const previewText = paragraphs[0]?.slice(0, 150) + (paragraphs[0]?.length > 150 ? '...' : '');

  const renderParagraph = (text: string) => {
    const { elements } = renderWithSearchableEntities(text, neighborhoodName, city, brief.sources);
    return elements;
  };

  return (
    <div className="border-l-2 border-amber-200 pl-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-amber-600">
          {formatTime(brief.generated_at)}
        </span>
      </div>
      <h4 className="font-medium text-sm text-neutral-800 mb-1">
        {brief.headline}
      </h4>
      <div className="text-xs text-neutral-600 leading-relaxed">
        {isExpanded ? (
          <div className="space-y-2">
            {paragraphs.map((p, i) => (
              <p key={i}>{renderParagraph(p)}</p>
            ))}
          </div>
        ) : (
          <p>{previewText}</p>
        )}
      </div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-1 text-xs text-amber-600 hover:text-amber-800"
      >
        {isExpanded ? 'Show less' : 'Read more'}
      </button>
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
    <div className="mb-4">
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 text-xs text-amber-700 hover:text-amber-900 transition-colors"
      >
        <span>{isVisible ? '▼' : '▶'}</span>
        <span>Previous briefs</span>
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
            <div className="text-xs text-amber-600 py-2">Loading...</div>
          )}

          {!isLoading && hasMore && briefs.length > 0 && (
            <button
              onClick={loadBriefs}
              className="text-xs text-amber-700 hover:text-amber-900 py-1"
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
