'use client';

import { cn } from '@/lib/utils';

export type FeedView = 'compact' | 'gallery';

interface ViewToggleProps {
  view: FeedView;
  onChange: (view: FeedView) => void;
}

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  const nextView = view === 'gallery' ? 'compact' : 'gallery';
  const label = view === 'gallery' ? 'Switch to compact view' : 'Switch to gallery view';

  return (
    <div className="flex items-center">
      {/* Desktop: show both buttons */}
      <div className="hidden md:flex items-center gap-1">
        <button
          onClick={() => onChange('compact')}
          className={cn(
            'flex items-center justify-center w-8 h-8 transition-colors',
            view === 'compact'
              ? 'text-white'
              : 'text-neutral-300 hover:text-neutral-500'
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
            'flex items-center justify-center w-8 h-8 transition-colors',
            view === 'gallery'
              ? 'text-white'
              : 'text-neutral-300 hover:text-neutral-500'
          )}
          aria-label="Gallery view"
          title="Gallery view"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
          </svg>
        </button>
      </div>

      {/* Mobile: single toggle button showing the OTHER view's icon */}
      <button
        onClick={() => onChange(nextView)}
        className="md:hidden flex items-center justify-center w-8 h-8 text-white transition-colors"
        aria-label={label}
        title={label}
      >
        {nextView === 'compact' ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
          </svg>
        )}
      </button>
    </div>
  );
}
