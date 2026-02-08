'use client';

import { useNeighborhoodModal } from '@/components/neighborhoods/NeighborhoodSelectorModal';

export function HeroStats({
  neighborhoodCount,
  cityCount,
}: {
  neighborhoodCount: number;
  cityCount: number;
}) {
  const { openModal } = useNeighborhoodModal();

  return (
    <button
      onClick={openModal}
      className="flex items-center justify-center gap-3 text-xs tracking-[0.2em] uppercase text-neutral-500 mb-10 hover:text-neutral-300 transition-colors cursor-pointer"
    >
      <span>{neighborhoodCount} neighborhoods</span>
      <span className="w-px h-3 bg-neutral-700" />
      <span>{cityCount} cities</span>
    </button>
  );
}
