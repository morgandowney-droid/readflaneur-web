'use client';

import { cn } from '@/lib/utils';

export type FeedView = 'compact' | 'gallery';

interface ViewToggleProps {
  view: FeedView;
  onChange: (view: FeedView) => void;
}

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-1">
      <button
        onClick={() => onChange('compact')}
        className={cn(
          'flex items-center justify-center w-9 h-9 rounded-md transition-colors',
          view === 'compact'
            ? 'bg-white shadow-sm text-black'
            : 'text-neutral-400 hover:text-neutral-600'
        )}
        aria-label="Compact view"
        title="Compact view"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      </button>
      <button
        onClick={() => onChange('gallery')}
        className={cn(
          'flex items-center justify-center w-9 h-9 rounded-md transition-colors',
          view === 'gallery'
            ? 'bg-white shadow-sm text-black'
            : 'text-neutral-400 hover:text-neutral-600'
        )}
        aria-label="Gallery view"
        title="Gallery view"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
      </button>
    </div>
  );
}
