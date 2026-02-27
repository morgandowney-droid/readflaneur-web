'use client';

import { useDiscoveryBriefs } from '@/hooks/useDiscoveryBriefs';
import { MobileDiscoverySection } from './MobileDiscoverySection';

interface NeighborhoodDiscoveryProps {
  neighborhoodId: string;
  neighborhoodName: string;
}

/**
 * Client wrapper for single-neighborhood pages.
 * Shows discovery cards below the feed on mobile only.
 */
export function NeighborhoodDiscovery({ neighborhoodId, neighborhoodName }: NeighborhoodDiscoveryProps) {
  const { sections, isLoading, refresh } = useDiscoveryBriefs([neighborhoodId]);

  return (
    <div className="md:hidden">
      <MobileDiscoverySection
        sections={sections || []}
        isLoading={isLoading}
        onRefresh={refresh}
        neighborhoodName={neighborhoodName}
      />
    </div>
  );
}
