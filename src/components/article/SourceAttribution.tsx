'use client';

import { ArticleSource } from '@/types';

interface SourceAttributionProps {
  sources?: ArticleSource[];
  editorNotes?: string | null;
  isAIGenerated?: boolean;
}

/** Parse "Source: Name - https://url" from editor_notes */
function parseEditorNotesSource(notes: string | null | undefined): { name: string; url: string } | null {
  if (!notes) return null;
  const match = notes.match(/^Source:\s*(.+?)\s*-\s*(https?:\/\/.+)$/);
  if (match) return { name: match[1].trim(), url: match[2].trim() };
  return null;
}

export function SourceAttribution({ sources, editorNotes, isAIGenerated }: SourceAttributionProps) {
  // Only show for AI-generated content
  if (!isAIGenerated) return null;

  // If no specific sources, try to extract from editor_notes (RSS source fallback)
  if (!sources || sources.length === 0) {
    const rssSource = parseEditorNotesSource(editorNotes);
    if (rssSource) {
      return (
        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-xs text-fg-muted">
            <span className="italic">Source: </span>
            <a
              href={rssSource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-neutral-300/60 hover:decoration-solid transition-all"
            >
              {rssSource.name}
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
    </div>
  );
}
