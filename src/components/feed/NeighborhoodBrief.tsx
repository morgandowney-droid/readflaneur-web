'use client';

import { useState } from 'react';

interface NeighborhoodBriefProps {
  headline: string;
  content: string;
  generatedAt: string;
  neighborhoodName: string;
}

/**
 * Clean content by removing citation markers and inline URLs
 * Handles formats like: [[1]](https://...) and (https://...)
 */
function cleanContent(text: string): string {
  return text
    // Remove markdown-style citations: [[1]](url) or [[1]](url)
    .replace(/\[\[\d+\]\]\([^)]+\)/g, '')
    // Remove standalone citation markers: [[1]]
    .replace(/\[\[\d+\]\]/g, '')
    // Remove parenthetical URLs: (https://...) or (http://...)
    .replace(/\(https?:\/\/[^)]+\)/g, '')
    // Remove bare URLs
    .replace(/https?:\/\/\S+/g, '')
    // Clean up multiple spaces
    .replace(/\s{2,}/g, ' ')
    // Clean up spaces before punctuation
    .replace(/\s+([.,!?])/g, '$1')
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
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
}: NeighborhoodBriefProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Clean content and split into paragraphs
  const cleanedContent = cleanContent(content);
  const paragraphs = cleanedContent.split('\n\n').filter(p => p.trim());
  const previewText = paragraphs[0] || cleanedContent;
  const hasMore = paragraphs.length > 1 || cleanedContent.length > 300;

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
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : (
          <p>{previewText}</p>
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
