'use client';

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
  if (n === 2) return ['wide', 'standard'];
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

export function BentoGrid({ sections, isLoading }: BentoGridProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 mb-12">
        <SkeletonGrid />
      </div>
    );
  }

  // Filter out sections with no cards
  const activeSections = sections.filter(s => s.cards.length > 0);
  if (activeSections.length === 0) return null;

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
      </div>
    </div>
  );
}
