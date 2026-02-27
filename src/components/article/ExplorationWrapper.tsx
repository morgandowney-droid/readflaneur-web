'use client';

import { useExplorationSession } from '@/hooks/useExplorationSession';
import { BackToFeedLink } from './TranslatedArticleNav';
import { ExplorationBar } from './ExplorationBar';
import { ExploreSubscribeNudge } from './ExploreSubscribeNudge';

interface ExplorationWrapperProps {
  isExploring: boolean;
  neighborhoodId: string;
  neighborhoodName: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  categoryLabel?: string;
}

/** Client wrapper that manages exploration session state and renders exploration-aware components */
export function ExplorationBackLink({ isExploring, neighborhoodName, city }: {
  isExploring: boolean;
  neighborhoodName: string;
  city: string;
}) {
  const { trailCount } = useExplorationSession(isExploring, neighborhoodName, city);
  return <BackToFeedLink isExploring={isExploring} trailCount={trailCount} />;
}

export function ExplorationBarWithSession({
  isExploring,
  neighborhoodId,
  neighborhoodName,
  city,
  country,
  latitude,
  longitude,
  categoryLabel,
}: ExplorationWrapperProps) {
  const { trailCount } = useExplorationSession(isExploring, neighborhoodName, city);

  return (
    <ExplorationBar
      neighborhoodId={neighborhoodId}
      city={city}
      country={country}
      latitude={latitude}
      longitude={longitude}
      categoryLabel={categoryLabel}
      isExploring={isExploring}
      trailCount={trailCount}
    />
  );
}

export { ExploreSubscribeNudge } from './ExploreSubscribeNudge';
