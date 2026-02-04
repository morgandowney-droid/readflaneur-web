'use client';

import { ArticleSource } from '@/types';

interface SourceAttributionProps {
  sources?: ArticleSource[];
  isAIGenerated?: boolean;
}

export function SourceAttribution({ sources, isAIGenerated }: SourceAttributionProps) {
  // Only show for AI-generated content
  if (!isAIGenerated) return null;

  // If no specific sources, show generic attribution
  if (!sources || sources.length === 0) {
    return (
      <div className="mt-8 pt-6 border-t border-neutral-200">
        <p className="text-xs text-neutral-400 italic">
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
            className="text-blue-600 hover:underline"
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
        <span className="text-neutral-500">{displayName}</span>
      </span>
    );
  };

  return (
    <div className="mt-8 pt-6 border-t border-neutral-200">
      <p className="text-xs text-neutral-400">
        <span className="italic">Synthesized from reporting by </span>
        {sources.map((source, index) => formatSource(source, index))}
        <span className="italic">.</span>
      </p>
    </div>
  );
}
