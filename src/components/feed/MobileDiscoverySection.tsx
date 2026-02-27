'use client';

import { BentoSection } from './BentoGrid';
import { MobileDiscoveryCard } from './MobileDiscoveryCard';
import { useTranslation } from '@/hooks/useTranslation';

interface MobileDiscoverySectionProps {
  sections: BentoSection[];
  isLoading?: boolean;
  onRefresh?: () => void;
  neighborhoodName?: string;
}

export function MobileDiscoverySection({
  sections,
  isLoading,
  onRefresh,
  neighborhoodName,
}: MobileDiscoverySectionProps) {
  const { t } = useTranslation();

  // Filter to discovery regions only (exclude user's neighborhoods section)
  const discoverySections = sections.filter(
    s => s.translationKey !== 'bento.yourNeighborhoods'
  );

  if (!isLoading && discoverySections.length === 0) return null;

  const title = neighborhoodName
    ? `${t('bento.beyond')} ${neighborhoodName}`
    : t('bento.beyondYour');

  return (
    <div className="mt-10 mb-8">
      {/* Section header */}
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-xs tracking-[0.2em] uppercase text-fg-muted">
          {title}
        </h3>
      </div>

      {isLoading ? (
        /* Loading skeleton: 2x2 grid of pulsing rectangles */
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="aspect-[4/3] rounded-xl bg-surface animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {discoverySections.map((section) => (
            <div key={section.translationKey} className="mb-6">
              <p className="text-[10px] tracking-[0.15em] uppercase text-fg-subtle mb-2">
                {t(section.translationKey) || section.label}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {section.cards.map((card) => (
                  <MobileDiscoveryCard
                    key={card.neighborhoodId}
                    headline={card.headline}
                    imageUrl={card.imageUrl}
                    neighborhoodName={card.neighborhoodName}
                    neighborhoodId={card.neighborhoodId}
                    city={card.city}
                    slug={card.slug}
                    citySlug={card.citySlug}
                    neighborhoodSlug={card.neighborhoodSlug}
                    onAdd={card.onAdd}
                  />
                ))}
              </div>
            </div>
          ))}

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="w-full text-center text-xs tracking-[0.15em] uppercase text-fg-muted hover:text-fg py-3 transition-colors"
            >
              {t('bento.showMore')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
