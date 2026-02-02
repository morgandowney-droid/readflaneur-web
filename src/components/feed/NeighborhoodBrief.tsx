'use client';

import { useState, ReactNode } from 'react';

interface NeighborhoodBriefProps {
  headline: string;
  content: string;
  generatedAt: string;
  neighborhoodName: string;
  city?: string;
}

// Common words to skip even if capitalized
const SKIP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'but', 'or', 'so', 'yet', 'for', 'nor',
  'in', 'on', 'at', 'to', 'from', 'with', 'by', 'about', 'into',
  'meanwhile', 'however', 'therefore', 'furthermore', 'moreover',
  'no', 'yes', 'not', 'also', 'just', 'even', 'still', 'already',
  'recent', 'quiet', 'development', 'folks', 'today', 'tomorrow',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
]);

// Connecting words that can appear in entity names
const CONNECTING_WORDS = new Set(['du', 'de', 'von', 'van', 'the', 'at', 'of', 'und', 'och', 'i', 'på']);

/**
 * Detect proper nouns and make them tappable for search
 */
function renderWithSearchableEntities(
  text: string,
  neighborhoodName: string,
  city: string
): ReactNode[] {
  const results: ReactNode[] = [];

  // Pattern matches:
  // 1. Quoted phrases: "Something Like This"
  // 2. Capitalized words (including unicode like Ö, Å, Ä)
  const entityPattern = /"([^"]+)"|([A-ZÄÖÅÆØÜÉ][a-zäöåæøüé']+)/g;

  let lastIndex = 0;
  let match;
  let currentEntity: string[] = [];
  let entityStartIndex = 0;

  const tokens: { start: number; end: number; text: string; isEntity: boolean }[] = [];

  // First pass: find all potential entity tokens
  while ((match = entityPattern.exec(text)) !== null) {
    const matchedText = match[1] || match[2]; // quoted content or capitalized word
    const isQuoted = !!match[1];

    if (isQuoted) {
      // Quoted phrases are always entities
      tokens.push({
        start: match.index,
        end: match.index + match[0].length,
        text: matchedText,
        isEntity: true,
      });
    } else {
      // Check if this capitalized word should be an entity
      const lowerText = matchedText.toLowerCase();
      const isAtSentenceStart = match.index === 0 ||
        /[.!?]\s*$/.test(text.slice(0, match.index));

      if (!SKIP_WORDS.has(lowerText) && !isAtSentenceStart) {
        tokens.push({
          start: match.index,
          end: match.index + match[0].length,
          text: matchedText,
          isEntity: true,
        });
      }
    }
  }

  // Second pass: merge consecutive entities with connecting words
  const mergedTokens: { start: number; end: number; text: string; isEntity: boolean }[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.isEntity) continue;

    // Look ahead to merge with next token if connected
    let merged = token.text;
    let endIndex = token.end;

    while (i + 1 < tokens.length) {
      const gap = text.slice(endIndex, tokens[i + 1].start);
      const gapWords = gap.trim().toLowerCase();

      // Check if gap is a connecting word or just space
      if (gap.length <= 4 && (gap.trim() === '' || CONNECTING_WORDS.has(gapWords))) {
        merged += gap + tokens[i + 1].text;
        endIndex = tokens[i + 1].end;
        i++;
      } else {
        break;
      }
    }

    // Skip if it's just the neighborhood name
    if (merged.toLowerCase() !== neighborhoodName.toLowerCase()) {
      mergedTokens.push({
        start: token.start,
        end: endIndex,
        text: merged,
        isEntity: true,
      });
    }
  }

  // Third pass: build result with plain text and entity spans
  lastIndex = 0;
  mergedTokens.forEach((token, idx) => {
    // Add plain text before this entity
    if (token.start > lastIndex) {
      results.push(text.slice(lastIndex, token.start));
    }

    // Add tappable entity
    const searchQuery = encodeURIComponent(`${token.text} ${neighborhoodName} ${city}`);
    results.push(
      <a
        key={idx}
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

  // Add remaining text
  if (lastIndex < text.length) {
    results.push(text.slice(lastIndex));
  }

  return results.length > 0 ? results : [text];
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
}: NeighborhoodBriefProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Clean content and split into paragraphs
  const cleanedContent = cleanContent(content);
  const paragraphs = cleanedContent.split('\n\n').filter(p => p.trim());
  const previewText = paragraphs[0] || cleanedContent;
  const hasMore = paragraphs.length > 1 || cleanedContent.length > 300;

  // Render paragraph with tappable entities
  const renderParagraph = (text: string) => renderWithSearchableEntities(text, neighborhoodName, city);

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
          Powered by Grok &middot; Real-time local intel from X
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
