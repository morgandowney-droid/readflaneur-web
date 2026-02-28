'use client';

import { useState } from 'react';
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

const PAGE_SIZE = 3;

/** Assign card sizes based on the number of cards in a section page */
function assignSizes(cards: BentoCardProps[], isUserSection: boolean): BentoCardProps['size'][] {
  const n = cards.length;
  if (isUserSection) {
    if (n === 1) return ['hero'];
    if (n === 2) return ['hero', 'standard'];
    return ['hero', ...Array(n - 1).fill('standard') as BentoCardProps['size'][]];
  }
  // Discovery regions
  if (n === 1) return ['wide'];
  if (n === 2) return ['wide', 'wide'];
  return ['wide', ...Array(n - 1).fill('standard') as BentoCardProps['size'][]];
}

function SectionHeader({ label, page, totalPages, onPrev, onNext }: {
  label: string;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="col-span-4 flex items-center gap-4 pt-6 pb-2 first:pt-0">
      <span className="text-[11px] tracking-[0.2em] uppercase font-medium text-fg-subtle whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onPrev}
            disabled={page === 0}
            className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-fg-muted hover:text-fg hover:border-border-strong transition-colors disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Previous"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2.5L4.5 6l3 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <span className="text-[10px] text-fg-subtle tabular-nums min-w-[28px] text-center">
            {page + 1}/{totalPages}
          </span>
          <button
            onClick={onNext}
            disabled={page >= totalPages - 1}
            className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-fg-muted hover:text-fg hover:border-border-strong transition-colors disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Next"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5L7.5 6l-3 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}

/** Centered arrow to jump past bento discovery sections to news feed */
function JumpToFeedArrow({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div className="col-span-4">
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
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-4 gap-3 relative">
      <div className="col-span-4 flex items-center gap-4 pt-0 pb-2">
        <div className="h-3 bg-elevated rounded w-32 animate-pulse" />
        <div className="flex-1 h-px bg-border" />
      </div>
      <BentoCardSkeleton size="hero" />
      <BentoCardSkeleton size="standard" />
      <BentoCardSkeleton size="standard" />
      <div className="col-span-4 flex items-center gap-4 pt-6 pb-2">
        <div className="h-3 bg-elevated rounded w-24 animate-pulse" />
        <div className="flex-1 h-px bg-border" />
      </div>
      <BentoCardSkeleton size="wide" />
      <BentoCardSkeleton size="standard" />
      <BentoCardSkeleton size="standard" />
    </div>
  );
}

/** Paginated section - manages its own page state */
function PaginatedSection({ section, isUserSection, onJumpToFeed, jumpLabel }: {
  section: BentoSection;
  isUserSection: boolean;
  onJumpToFeed?: () => void;
  jumpLabel: string;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(section.cards.length / PAGE_SIZE);
  const pageCards = section.cards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const sizes = assignSizes(pageCards, isUserSection);

  return (
    <div className="contents">
      <SectionHeader
        label={t(section.translationKey) || section.label}
        page={page}
        totalPages={totalPages}
        onPrev={() => setPage(p => Math.max(0, p - 1))}
        onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
      />
      {pageCards.map((card, i) => (
        <BentoCard
          key={card.neighborhoodId}
          {...card}
          size={sizes[i]}
        />
      ))}
      {isUserSection && onJumpToFeed && (
        <JumpToFeedArrow onClick={onJumpToFeed} label={jumpLabel} />
      )}
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
      <div className="grid grid-cols-4 gap-3">
        {activeSections.map((section) => {
          const isUserSection = section.translationKey === 'bento.yourNeighborhoods';
          return (
            <PaginatedSection
              key={section.translationKey}
              section={section}
              isUserSection={isUserSection}
              onJumpToFeed={isUserSection ? onJumpToFeed : undefined}
              jumpLabel={t('bento.jumpToFeed') || 'Jump to stories'}
            />
          );
        })}

        {/* Discover more button */}
        {onRefresh && (
          <div className="col-span-4 flex justify-center pt-4">
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
