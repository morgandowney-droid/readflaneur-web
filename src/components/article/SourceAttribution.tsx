'use client';

import { ArticleSource } from '@/types';

interface SourceAttributionProps {
  sources?: ArticleSource[];
  editorNotes?: string | null;
  isAIGenerated?: boolean;
  headline?: string;
  neighborhoodName?: string;
  /** Article category — brief_summary, look_ahead, weekly_recap etc. */
  category?: string;
}

/** Parse "Source: Name - https://url" from editor_notes */
function parseEditorNotesSource(notes: string | null | undefined): { name: string; url: string } | null {
  if (!notes) return null;
  const match = notes.match(/^Source:\s*(.+?)\s*-\s*(https?:\/\/.+)$/);
  if (match) return { name: match[1].trim(), url: match[2].trim() };
  return null;
}

export function SourceAttribution({ sources, editorNotes, isAIGenerated, headline, neighborhoodName, category }: SourceAttributionProps) {
  // Only show for AI-generated content
  if (!isAIGenerated) return null;

  // Editorial content types (briefs, look-ahead, sunday edition) never show "double-check here"
  // They are multi-source editorial products, not single-source RSS rewrites
  const isEditorial = category === 'brief_summary' || category === 'look_ahead' || category === 'weekly_recap';

  // Build a Google Search verification URL from headline + neighborhood
  // Strip category prefixes like "Style Alert: ", "Last Call: ", "LOOK AHEAD: " from search query
  const searchHeadline = headline?.replace(/^[^:]{1,30}:\s+/, '') || '';
  const verifyUrl = (!isEditorial && searchHeadline && neighborhoodName)
    ? `https://www.google.com/search?q=${encodeURIComponent(searchHeadline + ' ' + neighborhoodName)}`
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

  // If no specific sources, try to extract from editor_notes (RSS or government source)
  if (!sources || sources.length === 0) {
    const parsedSource = parseEditorNotesSource(editorNotes);
    if (parsedSource) {
      // Government/authoritative source - link directly, no verify needed
      return (
        <div className="mt-8 pt-6 border-t border-border">
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
        </div>
      );
    }

    return (
      <div className="mt-8 pt-6 border-t border-border">
        <p className="text-xs text-fg-muted italic">
          Synthesized from public news sources and social media via AI-powered search and analysis.
        </p>
        {verifyLink}
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
    if (source.source_type === 'x_user' && !displayName.startsWith('@')) {
      displayName = `@${displayName}`;
    }
    if (source.source_type === 'x_user') {
      displayName = `X user ${displayName}`;
    }

    // If we have a valid URL, make it a link
    if (source.source_url) {
      return (
        <span key={source.id}>
          {prefix}
          <a
            href={source.source_url}
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
    <div className="mt-8 pt-6 border-t border-border">
      <p className="text-xs text-fg-muted">
        <span className="italic">Synthesized from reporting by </span>
        {sources.map((source, index) => formatSource(source, index))}
        <span className="italic">.</span>
      </p>
      {sources.length <= 1 && verifyLink}
    </div>
  );
}
