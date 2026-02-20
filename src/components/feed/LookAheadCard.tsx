'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';

interface LookAheadCardProps {
  neighborhoodId: string;
  neighborhoodName: string;
  city?: string;
}

/**
 * Render plain text, converting markdown links [text](url) to <a> tags.
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

/**
 * Render a paragraph, handling **bold** and [[header]] markers plus markdown links.
 */
function renderParagraph(text: string, keyPrefix: string): ReactNode[] {
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
    segments.forEach((segment, i) => {
      if (segment.isBold) {
        result.push(
          <strong key={`${keyPrefix}-bold-${i}`} className="font-semibold text-fg">
            {renderWithLinks(segment.text, `${keyPrefix}-b${i}`)}
          </strong>
        );
      } else if (segment.text.trim()) {
        result.push(...renderWithLinks(segment.text, `${keyPrefix}-t${i}`));
      }
    });
    return result;
  }

  return renderWithLinks(text, keyPrefix);
}

/**
 * Expandable Look Ahead card below the Daily Brief.
 * Compact when closed (current styling), expands to show full article content
 * and discovery CTAs when clicked.
 */
export function LookAheadCard({ neighborhoodId, neighborhoodName, city }: LookAheadCardProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [bodyText, setBodyText] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const { t } = useTranslation();

  // Discovery CTA state - lazy loaded on first expand
  const [yesterdayUrl, setYesterdayUrl] = useState<string | null>(null);
  const [nearbyDiscovery, setNearbyDiscovery] = useState<{ url: string; neighborhoodName: string } | null>(null);
  const [randomDiscovery, setRandomDiscovery] = useState<{ url: string; neighborhoodName: string } | null>(null);
  const discoveryFetched = useRef(false);

  useEffect(() => {
    if (!neighborhoodId) return;
    let cancelled = false;

    fetch(`/api/briefs/look-ahead?neighborhoodId=${encodeURIComponent(neighborhoodId)}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.url) setUrl(data.url);
        if (data.bodyText) setBodyText(data.bodyText);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [neighborhoodId]);

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

      // Nearby
      const nearbyParams = new URLSearchParams(params);
      nearbyParams.set('mode', 'nearby');
      fetch(`/api/discover-neighborhood?${nearbyParams}`)
        .then(res => res.json())
        .then(data => { if (data.neighborhoodName) setNearbyDiscovery(data); })
        .catch(() => {});

      // Random
      const randomParams = new URLSearchParams(params);
      randomParams.set('mode', 'random');
      if (city) randomParams.set('excludeCity', city);
      fetch(`/api/discover-neighborhood?${randomParams}`)
        .then(res => res.json())
        .then(data => { if (data.neighborhoodName) setRandomDiscovery(data); })
        .catch(() => {});

      // Yesterday's brief
      fetch(`/api/briefs/yesterday?neighborhoodId=${encodeURIComponent(neighborhoodId)}`)
        .then(res => res.json())
        .then(data => { if (data.url) setYesterdayUrl(data.url); })
        .catch(() => {});
    } catch {
      // localStorage or fetch failure
    }
  }, [isExpanded, neighborhoodId, city]);

  if (!url) return null;

  // Parse body text into paragraphs, handling [[Day, Date]] headers
  const paragraphs = bodyText ? bodyText.split('\n\n').filter(p => p.trim()) : [];
  const previewText = paragraphs[0] || '';
  const hasMore = paragraphs.length > 1;

  const handleToggle = () => {
    setIsExpanded(prev => !prev);
  };

  return (
    <div
      className="bg-surface border-l-2 border-amber-500/20 p-4 mt-2 cursor-pointer"
      onClick={handleToggle}
    >
      <p className="text-[10px] uppercase tracking-[0.2em] text-fg-subtle mb-1">
        {t('feed.lookAhead')}
      </p>

      {isExpanded && bodyText ? (
        <>
          {/* Full content */}
          <div className="text-sm text-fg-muted leading-relaxed space-y-3 mt-2">
            {paragraphs.map((p, i) => {
              // Detect [[Day, Date]] headers
              const headerMatch = p.match(/^\[\[(.+)\]\]$/);
              if (headerMatch) {
                return (
                  <h3 key={i} className="text-xs font-semibold text-fg uppercase tracking-widest mt-4 mb-1">
                    {headerMatch[1]}
                  </h3>
                );
              }
              return <p key={i}>{renderParagraph(p, `la-${i}`)}</p>;
            })}
            <button
              onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
              className="inline text-xs font-medium text-fg-muted hover:text-fg transition-colors"
            >
              {t('feed.showLess')}
            </button>
          </div>

          {/* Read full article link */}
          <div className="mt-3 pt-2 border-t border-border">
            <Link
              href={url}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-fg-muted hover:text-accent transition-colors"
            >
              Read the full Look Ahead article &rsaquo;
            </Link>
          </div>

          {/* Discovery CTAs */}
          {(yesterdayUrl || nearbyDiscovery || randomDiscovery) && (
            <div className="mt-2 pt-2 border-t border-border flex flex-col gap-1.5">
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
                  className="mt-1 text-xs text-fg-muted hover:text-accent transition-colors"
                >
                  Take me somewhere new &rsaquo;
                </Link>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Compact preview - same as before but with expand hint */}
          {bodyText && previewText ? (
            <p className="text-sm text-fg-muted">
              {renderParagraph(previewText, 'la-preview')}
              {hasMore && (
                <>
                  {' '}
                  <span className="text-xs font-medium text-fg-muted hover:text-fg transition-colors">
                    {t('feed.readMore')} &rsaquo;
                  </span>
                </>
              )}
            </p>
          ) : (
            <Link
              href={url}
              onClick={(e) => e.stopPropagation()}
              className="text-sm text-fg-muted hover:text-accent transition-colors"
            >
              {t('feed.lookAheadCta').replace('{name}', neighborhoodName)} &rsaquo;
            </Link>
          )}
        </>
      )}
    </div>
  );
}
