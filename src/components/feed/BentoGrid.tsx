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
}

/** Assign card sizes based on the number of cards in a section */
function assignSizes(cards: BentoCardProps[], isUserSection: boolean): BentoCardProps['size'][] {
  const n = cards.length;
  if (isUserSection) {
    // User neighborhoods: first card is hero, rest standard
    if (n === 1) return ['hero'];
    if (n === 2) return ['hero', 'standard'];
    return ['hero', ...Array(n - 1).fill('standard') as BentoCardProps['size'][]];
  }
  // Discovery regions
  if (n === 1) return ['wide'];
  if (n === 2) return ['wide', 'wide']; // Two wide cards fill all 4 columns evenly
  // 3+ cards: first wide, rest standard
  return ['wide', ...Array(n - 1).fill('standard') as BentoCardProps['size'][]];
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="col-span-4 flex items-center gap-4 pt-6 pb-2 first:pt-0">
      <span className="text-[11px] tracking-[0.2em] uppercase font-medium text-fg-subtle whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-4 gap-3 relative">
      <SectionHeader label="..." />
      <BentoCardSkeleton size="hero" />
      <BentoCardSkeleton size="standard" />
      <BentoCardSkeleton size="standard" />
      <SectionHeader label="..." />
      <BentoCardSkeleton size="wide" />
      <BentoCardSkeleton size="standard" />
      <BentoCardSkeleton size="standard" />
    </div>
  );
}

export function BentoGrid({ sections, isLoading, onRefresh }: BentoGridProps) {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 mb-12">
        <SkeletonGrid />
      </div>
    );
  }

  // Filter out empty sections and discovery sections with <2 cards (can't fill grid)
  const activeSections = sections.filter(s => {
    if (s.cards.length === 0) return false;
    // Discovery sections need >=2 cards to fill grid columns properly
    if (s.translationKey !== 'bento.yourNeighborhoods' && s.cards.length < 2) return false;
    return true;
  });
  if (activeSections.length === 0) return null;

  const handleRefresh = () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    onRefresh();
    // Reset after a tick (parent will set isLoading which shows skeleton)
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 mb-12">
      <div className="grid grid-cols-4 gap-3">
        {activeSections.map((section) => {
          const isUserSection = section.translationKey === 'bento.yourNeighborhoods';
          const sizes = assignSizes(section.cards, isUserSection);

          return (
            <div key={section.translationKey} className="contents">
              <SectionHeader label={t(section.translationKey) || section.label} />
              {section.cards.map((card, i) => (
                <BentoCard
                  key={card.neighborhoodId}
                  {...card}
                  size={sizes[i]}
                />
              ))}
            </div>
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
