'use client';

import { useState, useEffect, useRef, ReactNode } from 'react';
import Link from 'next/link';
import { useLanguageContext } from '@/components/providers/LanguageProvider';
import { useTranslation } from '@/hooks/useTranslation';
import { ShareButton } from '@/components/ui/ShareButton';

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
/**
 * Render plain text segments, converting markdown links to <a> tags
 */
function renderWithLinks(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let lastIndex = 0;
  let match;
  let keyIndex = 0;

  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <a key={`${keyPrefix}-link-${keyIndex++}`} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-current underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-solid hover:decoration-neutral-300/60">
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function renderWithBold(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Match both [[header]] and **bold** patterns
  const headerPattern = /\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;
  let keyIndex = 0;

  while ((match = headerPattern.exec(text)) !== null) {
    // Add text before the match (with link rendering)
    if (match.index > lastIndex) {
      parts.push(...renderWithLinks(text.slice(lastIndex, match.index), `pre-${keyIndex}`));
    }
    // Add the bold text (match[1] for [[]], match[2] for **)
    const boldText = match[1] || match[2];
    parts.push(
      <strong key={`bold-${keyIndex++}`} className="font-semibold text-fg">
        {boldText}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text (with link rendering)
  if (lastIndex < text.length) {
    parts.push(...renderWithLinks(text.slice(lastIndex), `rest`));
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
  briefId?: string;
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
  shareUrl?: string;
}

/**
 * Pass-through for text rendering. Auto-linking of proper nouns was removed
 * because it was too aggressive and made content cluttered with hyperlinks.
 * Pipeline-injected links from Gemini (stored as markdown in DB) still render
 * via the link/bold processing code below.
 */
function renderWithSearchableEntities(
  text: string,
  _neighborhoodName: string,
  _city: string,
  _sources?: BriefSource[],
  _enrichedCategories?: EnrichedCategory[]
): { elements: ReactNode[]; hasEntities: boolean; verifiedCount: number } {
  return { elements: renderWithLinks(text, 'entity'), hasEntities: false, verifiedCount: 0 };
}

/**
 * Clean content by removing citation markers, inline URLs, and HTML tags
 * Uses citation positions to create natural paragraph breaks
 * Removes em dashes (AI-generated content indicator)
 */
function cleanContent(text: string): string {
  return text
    // Strip raw search result objects leaked from AI tool output
    // Matches patterns like: {'title': '...', 'url': '...', 'snippet': ...}
    .replace(/\{['"](?:title|url|snippet|author|published_at)['"]:[^}]*(?:\}|$)/gm, '')
    // Convert HTML <a> tags to markdown links (preserves hyperlinks for rendering)
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '[$2]($1)')
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
    // Remove parenthetical URLs (but preserve URLs inside markdown links)
    .replace(/(?<!\])\(https?:\/\/[^)]+\)/g, '')
    // Remove bare URLs (but preserve URLs inside markdown links)
    .replace(/(?<!\]\()https?:\/\/\S+/g, '')
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

function formatTime(dateString: string, locale: string = 'en') {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) {
    return 'Just now';
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  }
}

export function NeighborhoodBrief({
  briefId,
  headline,
  content,
  generatedAt,
  neighborhoodName,
  neighborhoodId,
  city = '',
  sources = [],
  enrichedContent,
  enrichedCategories,
  shareUrl,
}: NeighborhoodBriefProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { language, isTranslated } = useLanguageContext();
  const { t } = useTranslation();
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);

  // Discovery CTA state - lazy loaded on first expand
  const [nearbyDiscovery, setNearbyDiscovery] = useState<{ url: string; neighborhoodName: string } | null>(null);
  const [randomDiscovery, setRandomDiscovery] = useState<{ url: string; neighborhoodName: string } | null>(null);
  const [yesterdayUrl, setYesterdayUrl] = useState<string | null>(null);
  const discoveryFetched = useRef(false);

  // Fetch translated brief content when language changes
  useEffect(() => {
    if (!isTranslated || !briefId) {
      setTranslatedContent(null);
      return;
    }

    // Clear stale translation from previous language before fetching new one
    setTranslatedContent(null);

    let cancelled = false;
    fetch(`/api/translations/brief?id=${briefId}&lang=${language}`)
      .then(res => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(data => {
        if (!cancelled) {
          setTranslatedContent(data.enriched_content || data.content || null);
        }
      })
      .catch(() => {
        // Fall back to English - state already cleared above
      });

    return () => { cancelled = true; };
  }, [briefId, language, isTranslated]);

  // Lazy fetch discovery CTAs on first expand
  useEffect(() => {
    if (!isExpanded || discoveryFetched.current || !neighborhoodId) return;
    discoveryFetched.current = true;

    try {
      const stored = localStorage.getItem('flaneur-neighborhood-preferences');
      const subscribedIds = stored ? JSON.parse(stored) as string[] : [];
      const params = new URLSearchParams();
      if (subscribedIds.length > 0) params.set('subscribedIds', subscribedIds.join(','));
      if (neighborhoodId) params.set('referenceId', neighborhoodId);

      // Fetch nearby and random in parallel
      const nearbyParams = new URLSearchParams(params);
      nearbyParams.set('mode', 'nearby');

      const randomParams = new URLSearchParams(params);
      randomParams.set('mode', 'random');
      if (city) randomParams.set('excludeCity', city);

      fetch(`/api/discover-neighborhood?${nearbyParams}`)
        .then(res => res.json())
        .then(data => {
          if (data.neighborhoodName) setNearbyDiscovery(data);
        })
        .catch(() => {});

      fetch(`/api/discover-neighborhood?${randomParams}`)
        .then(res => res.json())
        .then(data => {
          if (data.neighborhoodName) setRandomDiscovery(data);
        })
        .catch(() => {});

      // Fetch yesterday's brief for this neighborhood (before the current brief's date)
      if (neighborhoodId && generatedAt) {
        const params = new URLSearchParams({ neighborhoodId, beforeDate: generatedAt });
        fetch(`/api/briefs/yesterday?${params}`)
          .then(res => res.json())
          .then(data => { if (data.url) setYesterdayUrl(data.url); })
          .catch(() => {});
      }

    } catch {
      // localStorage or fetch failure - silently skip CTAs
    }
  }, [isExpanded, neighborhoodId, city]);

  // Never display unenriched (raw Grok) content - wait for Gemini enrichment
  if (!enrichedContent) return null;

  const displayContent = translatedContent || enrichedContent;
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
            <strong key={`bold-seg-${segIdx}`} className="font-semibold text-fg">
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
        <strong key="header" className="font-semibold text-fg">
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
    <div
      className="bg-surface p-5 md:p-6 mb-3 cursor-pointer border-l-2 border-amber-500/40"
      onClick={() => { if (hasMore) setIsExpanded(!isExpanded); }}
    >
      {/* Eyebrow + Live Dot */}
      <div className="flex items-center justify-between gap-2 font-mono text-xs uppercase tracking-[0.2em] text-amber-600/80 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span>
            {(() => {
              const d = new Date(generatedAt);
              const weekday = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
              const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
              const date = d.getDate();
              return `${weekday} ${month} ${date} | ${t('feed.dailyBrief').toUpperCase()}`;
            })()}
          </span>
        </div>
        {shareUrl && (
          <ShareButton
            variant="icon"
            title={`${neighborhoodName} Daily Brief`}
            text={headline}
            url={shareUrl}
            className="text-amber-600/60 hover:text-amber-600"
          />
        )}
      </div>

      {/* Headline */}
      <h3 className="font-display text-2xl md:text-3xl text-fg leading-tight mb-4 md:whitespace-nowrap md:overflow-hidden">
        {headline}
      </h3>

      {/* Content */}
      <div className="text-lg text-fg-muted leading-relaxed max-w-prose">
        {isExpanded ? (
          <div className="space-y-4">
            {paragraphs.map((p, i) => (
              <p key={i}>{renderParagraph(p, i === paragraphs.length - 1)}</p>
            ))}
            <button
              onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
              className="inline text-sm font-medium text-fg-muted hover:text-fg transition-colors"
            >
              {t('feed.showLess')}
            </button>
          </div>
        ) : (
          <p>
            {renderParagraph(previewText, paragraphs.length === 1)}
            {hasMore && (
              <>
                {' '}
                <button
                  onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
                  className="inline text-sm font-medium text-fg-muted hover:text-fg transition-colors"
                >
                  {t('feed.readMore')} &rsaquo;
                </button>
              </>
            )}
          </p>
        )}
      </div>

      {/* Source attribution - only show when expanded */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-border">
          {hasEnrichedSources ? (
            <p className="text-[10px] text-fg-muted leading-relaxed">
              <span className="italic">{t('brief.synthesized')} </span>
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
            <p className="text-[10px] text-fg-muted italic">
              {t('brief.synthesizedGeneric')}
            </p>
          )}
        </div>
      )}

      {/* Discovery CTAs - only show when expanded and at least one result loaded */}
      {isExpanded && (yesterdayUrl || nearbyDiscovery || randomDiscovery) && (
        <div className="mt-3 pt-3 border-t border-border flex flex-col gap-1.5">
          {yesterdayUrl && (
            <Link
              href={yesterdayUrl}
              scroll={true}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-fg-muted hover:text-accent transition-colors"
            >
              Read yesterday&apos;s <span className="font-semibold text-fg">{neighborhoodName}</span> Daily Brief &rsaquo;
            </Link>
          )}
          {nearbyDiscovery && (
            <Link
              href={nearbyDiscovery.url}
              scroll={true}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-fg-muted hover:text-accent transition-colors"
            >
              Read today&apos;s nearby <span className="font-semibold text-fg">{nearbyDiscovery.neighborhoodName}</span> Daily Brief &rsaquo;
            </Link>
          )}
          {randomDiscovery && (
            <Link
              href={randomDiscovery.url}
              scroll={true}
              onClick={(e) => e.stopPropagation()}
              className="mt-1.5 text-xs text-fg-muted hover:text-accent transition-colors"
            >
              Take me somewhere new &rsaquo;
            </Link>
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
        <div className="w-1.5 h-1.5 rounded-full bg-elevated" />
        <div className="h-3 w-28 bg-elevated rounded" />
      </div>
      <div className="h-7 w-3/4 bg-elevated rounded mb-4" />
      <div className="space-y-2 max-w-prose">
        <div className="h-3 w-full bg-elevated rounded" />
        <div className="h-3 w-5/6 bg-elevated rounded" />
        <div className="h-3 w-4/6 bg-elevated rounded" />
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
  const { t } = useTranslation();

  // Never display unenriched content
  if (!brief.enriched_content) return null;
  const displayContent = brief.enriched_content;
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
          result.push(<strong key={`b-${segIdx}`} className="font-semibold text-fg">{elements}</strong>);
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
            {t('brief.aiSynthesized')}
          </span>
        </div>
        {brief.enriched_at && (
          <span className="text-[10px] text-amber-500">{t('brief.verified')}</span>
        )}
      </div>

      {/* Headline */}
      <h4 className="font-medium text-sm text-fg mb-1">
        {brief.headline}
      </h4>

      {/* Content */}
      <div className="text-xs text-fg-muted leading-relaxed">
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
        {isExpanded ? t('feed.showLess') : t('feed.readMore')}
      </button>

      {/* Source attribution - per editorial standards */}
      {isExpanded && brief.enriched_categories && brief.enriched_categories.length > 0 && (
        <div className="mt-2 pt-2 border-t border-amber-100">
          <p className="text-[9px] text-amber-500 leading-relaxed">
            <span className="italic">{t('brief.sources')}: </span>
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
  const { t } = useTranslation();

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
    } catch {
      // iOS Safari "Load failed" - silently handle
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
        className="flex items-center gap-2 text-xs text-fg-muted hover:text-neutral-900 transition-colors"
      >
        <span className="text-[10px]">{isVisible ? '▼' : '▶'}</span>
        <span>{t('brief.previousDays')}</span>
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
            <div className="text-xs text-fg-muted py-2">{t('general.loading')}</div>
          )}

          {!isLoading && hasMore && briefs.length > 0 && (
            <button
              onClick={loadBriefs}
              className="text-xs text-fg-muted hover:text-neutral-900 py-1"
            >
              {t('brief.loadMore')}
            </button>
          )}

          {!isLoading && briefs.length === 0 && (
            <p className="text-xs text-fg-subtle py-2">{t('brief.noArchived')}</p>
          )}
        </div>
      )}
    </div>
  );
}
