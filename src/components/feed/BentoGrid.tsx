'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { BentoCard, BentoCardProps, BentoCardSkeleton } from './BentoCard';
import { useTranslation } from '@/hooks/useTranslation';

export interface BentoSection {
  label: string;
  translationKey: string;
  cards: BentoCardProps[];
}

interface BentoGridProps {
  sections: BentoSection[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onJumpToFeed?: () => void;
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 pt-6 pb-2 first:pt-0">
      <span className="text-[11px] tracking-[0.2em] uppercase font-medium text-fg-subtle whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

/** Horizontal scroll strip with arrow buttons and fade indicators */
function ScrollableRow({ cards }: { cards: BentoCardProps[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect(); };
  }, [checkScroll, cards.length]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -292 : 292, behavior: 'smooth' });
  };

  return (
    <div className="relative group/scroll">
      {/* Left fade + arrow */}
      {canScrollLeft && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-canvas to-transparent z-10 pointer-events-none" />
          <button
            onClick={() => scroll('left')}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-surface/90 backdrop-blur-sm border border-border flex items-center justify-center text-fg-muted hover:text-fg transition-colors opacity-0 group-hover/scroll:opacity-100"
            aria-label="Scroll left"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </>
      )}

      {/* Right fade + arrow */}
      {canScrollRight && (
        <>
          <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-canvas to-transparent z-10 pointer-events-none" />
          <button
            onClick={() => scroll('right')}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-surface/90 backdrop-blur-sm border border-border flex items-center justify-center text-fg-muted hover:text-fg transition-colors opacity-0 group-hover/scroll:opacity-100"
            aria-label="Scroll right"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </>
      )}

      {/* Scrollable container */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory"
      >
        {cards.map((card) => (
          <BentoCard
            key={card.neighborhoodId}
            {...card}
            size="scroll"
          />
        ))}
      </div>
    </div>
  );
}

/** Centered arrow to jump past bento discovery sections to news feed */
function JumpToFeedArrow({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 py-3 mx-auto text-fg-subtle hover:text-fg transition-colors"
    >
      <span className="text-[10px] tracking-[0.15em] uppercase font-medium">
        {label}
      </span>
      <svg
        width="28" height="28" viewBox="0 0 28 28" fill="none"
        className="animate-bounce-subtle"
      >
        <path d="M8 12l6 5 6-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

function SkeletonGrid() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 pt-0 pb-2">
        <div className="h-3 bg-elevated rounded w-32" />
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="flex gap-3 overflow-hidden">
        {[...Array(4)].map((_, i) => (
          <BentoCardSkeleton key={i} size="scroll" />
        ))}
      </div>
      <div className="flex items-center gap-4 pt-6 pb-2">
        <div className="h-3 bg-elevated rounded w-24" />
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="flex gap-3 overflow-hidden">
        {[...Array(4)].map((_, i) => (
          <BentoCardSkeleton key={i} size="scroll" />
        ))}
      </div>
    </div>
  );
}

export function BentoGrid({ sections, isLoading, onRefresh, onJumpToFeed }: BentoGridProps) {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 mb-12">
        <SkeletonGrid />
      </div>
    );
  }

  // Filter out empty sections and discovery sections with <2 cards
  const activeSections = sections.filter(s => {
    if (s.cards.length === 0) return false;
    if (s.translationKey !== 'bento.yourNeighborhoods' && s.cards.length < 2) return false;
    return true;
  });
  if (activeSections.length === 0) return null;

  const handleRefresh = () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    onRefresh();
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 mb-12">
      <div className="space-y-2">
        {activeSections.map((section) => {
          const isUserSection = section.translationKey === 'bento.yourNeighborhoods';

          return (
            <div key={section.translationKey}>
              <SectionHeader label={t(section.translationKey) || section.label} />
              <ScrollableRow cards={section.cards} />
              {isUserSection && onJumpToFeed && (
                <JumpToFeedArrow
                  onClick={onJumpToFeed}
                  label={t('bento.jumpToFeed') || 'Jump to stories'}
                />
              )}
            </div>
          );
        })}

        {/* Discover more button */}
        {onRefresh && (
          <div className="flex justify-center pt-4">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 text-xs tracking-wide text-fg-subtle hover:text-fg transition-colors disabled:opacity-50"
            >
              <svg
                width="14" height="14" viewBox="0 0 14 14" fill="none"
                className={`transition-transform ${refreshing ? 'animate-spin' : ''}`}
              >
                <path d="M1.5 7a5.5 5.5 0 019.37-3.9M12.5 7a5.5 5.5 0 01-9.37 3.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                <path d="M11 1v2.5h-2.5M3 11v-2.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('bento.discoverMore') || 'Discover more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
