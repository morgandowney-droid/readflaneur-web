'use client';

import { ComboComponent } from '@/lib/combo-utils';
import { getWikipediaUrl, getMapLocation } from '@/lib/neighborhood-utils';

interface ComboNeighborhoodCardsProps {
  components: ComboComponent[];
  citySlug: string;
}

/**
 * Horizontal card layout for combo neighborhood components
 * Each card shows: component name + Places/Map/Wiki links
 */
export function ComboNeighborhoodCards({ components, citySlug }: ComboNeighborhoodCardsProps) {
  // Convert neighborhood ID to URL slug (e.g., 'nyc-park-slope' -> 'park-slope')
  const getNeighborhoodSlug = (id: string): string => {
    // Remove the city prefix (e.g., 'nyc-', 'sf-', etc.)
    const parts = id.split('-');
    return parts.slice(1).join('-');
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
      {components.map((component) => {
        const slug = getNeighborhoodSlug(component.id);
        const mapLocation = getMapLocation(component.id, component.name, component.city);
        const mapUrl = `https://www.google.com/maps/place/${encodeURIComponent(mapLocation)}`;
        const wikiUrl = getWikipediaUrl(component.id, component.name);

        return (
          <div
            key={component.id}
            className="flex-shrink-0 bg-surface border border-white/[0.08] rounded-lg p-3 min-w-[140px]"
          >
            <p className="font-medium text-sm text-neutral-200 mb-2 text-center">
              {component.name}
            </p>
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2 text-[10px] tracking-widest uppercase">
                <a
                  href={`/${citySlug}/${slug}/guides`}
                  className="text-neutral-500 hover:text-white transition-colors"
                >
                  Places
                </a>
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-500 hover:text-white transition-colors"
                >
                  Map
                </a>
              </div>
              <a
                href={wikiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] tracking-widest uppercase text-neutral-500 hover:text-white transition-colors"
              >
                Wiki
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
