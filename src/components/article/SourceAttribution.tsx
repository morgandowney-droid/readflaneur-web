'use client';

import { type ReactNode } from 'react';
import { ArticleSource } from '@/types';

interface SourceAttributionProps {
  sources?: ArticleSource[];
  editorNotes?: string | null;
  isAIGenerated?: boolean;
  headline?: string;
  neighborhoodName?: string;
  /** Article category — brief_summary, look_ahead, weekly_recap etc. */
  category?: string;
  /** Raw category_label from article (e.g., "Auction Watch", "Noise Watch") */
  categoryLabel?: string;
  /** Slot for actions (e.g., reactions) rendered right-aligned on the same row */
  actions?: ReactNode;
}

/** Parse "Source: Name - https://url" from editor_notes */
function parseEditorNotesSource(notes: string | null | undefined): { name: string; url: string } | null {
  if (!notes) return null;
  const match = notes.match(/^Source:\s*(.+?)\s*-\s*(https?:\/\/.+)$/);
  if (match) return { name: match[1].trim(), url: match[2].trim() };
  return null;
}

/**
 * Build a smarter search query based on article type.
 * Globally syndicated stories (auctions, galas, etc.) should not include
 * the neighborhood name since it's irrelevant to verifying the story.
 */
function buildSearchQuery(headline: string, neighborhoodName: string, categoryLabel?: string): string {
  const cleanHeadline = headline.replace(/^[^:]{1,30}:\s+/, '');
  const label = categoryLabel?.toLowerCase() || '';

  // Globally syndicated categories — search headline only, no neighborhood
  if (label.includes('auction') || label.includes('gala') || label.includes('overture')
    || label.includes('route') || label.includes('sample sale') || label.includes('archive')
    || label.includes('residency') || label.includes('museum') || label.includes('fashion week')) {
    return cleanHeadline;
  }

  return `${cleanHeadline} ${neighborhoodName}`;
}

export function SourceAttribution({ sources, editorNotes, isAIGenerated, headline, neighborhoodName, category, categoryLabel, actions }: SourceAttributionProps) {
  // For non-AI content, still render actions if provided
  if (!isAIGenerated) {
    if (actions) {
      return (
        <div className="mt-8 pt-6 border-t border-border flex items-start justify-end">
          {actions}
        </div>
      );
    }
    return null;
  }

  // Editorial content types (briefs, look-ahead, sunday edition) never show "double-check here"
  // They are multi-source editorial products, not single-source RSS rewrites
  const isEditorial = category === 'brief_summary' || category === 'look_ahead' || category === 'weekly_recap';

  // Build a Google Search verification URL
  const searchQuery = (headline && neighborhoodName) ? buildSearchQuery(headline, neighborhoodName, categoryLabel) : '';
  const verifyUrl = (!isEditorial && searchQuery)
    ? `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`
    : null;

  const verifyLink = verifyUrl ? (
    <span className="block mt-1.5 text-xs text-fg-muted">
      This is a single-source story. It&apos;s always wise to double-check{' '}
      <a
        href={verifyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-neutral-300/60 hover:decoration-solid transition-all"
      >
        here
      </a>
    </span>
  ) : null;

  // Show generic attribution only when no sources exist in the DB
  // Editorial articles with real sources (e.g., briefs citing Eater NY, West Side Rag) should list them
  if (!sources || sources.length === 0) {
    const parsedSource = parseEditorNotesSource(editorNotes);
    if (parsedSource) {
      // Government/authoritative source - link directly, no verify needed
      return (
        <div className="mt-8 pt-6 border-t border-border flex items-start justify-between gap-4">
          <p className="text-xs text-fg-muted">
            <span className="italic">Source: </span>
            <a
              href={parsedSource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-neutral-300/60 hover:decoration-solid transition-all"
            >
              {parsedSource.name}
            </a>
          </p>
          {actions}
        </div>
      );
    }

    return (
      <div className="mt-8 pt-6 border-t border-border flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-fg-muted italic">
            Synthesized from public news sources and social media via AI-powered search and analysis.
          </p>
          {verifyLink}
        </div>
        {actions}
      </div>
    );
  }

  // Format sources for display
  const formatSource = (source: ArticleSource, index: number) => {
    const isLast = index === sources.length - 1;
    const isSecondToLast = index === sources.length - 2;

    let prefix = '';
    if (index > 0) {
      prefix = isLast ? ' and ' : ', ';
    }

    // Format the source name based on type
    let displayName = source.source_name;
    let linkUrl = source.source_url;

    // For X/Twitter sources: show username, link to Google search instead of x.com (requires login)
    const isXUrl = source.source_url && (source.source_url.includes('x.com/') || source.source_url.includes('twitter.com/'));
    if (source.source_type === 'x_user' || isXUrl) {
      // Extract username from URL pattern twitter.com/{user}/status or from source_name
      let username = '';
      if (source.source_url) {
        const userMatch = source.source_url.match(/(?:x\.com|twitter\.com)\/([^/]+)\/status/);
        if (userMatch && userMatch[1] !== 'i') username = userMatch[1];
      }
      // Clean up display name
      if (username) {
        displayName = `@${username}`;
      } else if (displayName.startsWith('@')) {
        // Already has @handle
      } else if (/^(X|Twitter)$/i.test(displayName.trim())) {
        displayName = 'X post';
      } else {
        // Has a descriptive name like "Twitter (Mayor Redler)"
        displayName = displayName.replace(/^Twitter\s*/i, '').replace(/^\(|\)$/g, '').trim() || 'X post';
      }
      // Link to Google search for the content instead of X (which requires login)
      linkUrl = `https://www.google.com/search?q=${encodeURIComponent(displayName.replace(/^@/, '') + ' site:x.com')}`;
    }

    // If we have a valid URL, make it a link
    if (linkUrl) {
      return (
        <span key={source.id}>
          {prefix}
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-neutral-300/60 hover:decoration-solid transition-all"
          >
            {displayName}
          </a>
        </span>
      );
    }

    // Otherwise just show the name (for platform-level attribution)
    return (
      <span key={source.id}>
        {prefix}
        <span className="text-fg-subtle">{displayName}</span>
      </span>
    );
  };

  return (
    <div className="mt-8 pt-6 border-t border-border flex items-start justify-between gap-4">
      <div>
        <p className="text-xs text-fg-muted">
          <span className="italic">Synthesized from reporting by </span>
          {sources.map((source, index) => formatSource(source, index))}
          <span className="italic">.</span>
        </p>
        {sources.length <= 1 && verifyLink}
      </div>
      {actions}
    </div>
  );
}
