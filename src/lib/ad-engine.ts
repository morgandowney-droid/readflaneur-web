import { Article, Ad, FeedItem, AdPlacement } from '@/types';

interface InjectAdsOptions {
  sectionIds?: string[];
  userInterestIds?: string[];
}

export function injectAds(
  articles: Article[],
  ads: Ad[],
  neighborhoodIds: string[],
  options?: InjectAdsOptions
): FeedItem[] {
  const { sectionIds, userInterestIds } = options || {};

  // Filter ads: active, feed placement, and global OR matching any selected neighborhood
  let relevantAds = ads.filter(
    (ad) =>
      ad.status === 'active' &&
      (ad.placement === 'feed' || !ad.placement) && // Default to feed if no placement set
      (ad.is_global || (ad.neighborhood_id && neighborhoodIds.includes(ad.neighborhood_id)))
  );

  // If section targeting is enabled, filter ads by section
  if (sectionIds?.length || userInterestIds?.length) {
    const targetSectionIds = [...(sectionIds || []), ...(userInterestIds || [])];

    relevantAds = relevantAds.filter((ad) => {
      // Ads without section targeting show everywhere (backward compatible)
      if (!ad.section_ids?.length) return true;

      // Ads with section targeting only show if they match
      return ad.section_ids.some(id => targetSectionIds.includes(id));
    });
  }

  // Insert ad every 4th position
  const feed: FeedItem[] = [];
  let adIndex = 0;

  articles.forEach((article, i) => {
    feed.push({ type: 'article', data: article });
    if ((i + 1) % 4 === 0 && relevantAds.length > 0) {
      feed.push({ type: 'ad', data: relevantAds[adIndex % relevantAds.length] });
      adIndex++;
    }
  });

  return feed;
}

export function getStoryOpenAds(ads: Ad[], neighborhoodId: string): Ad[] {
  return ads.filter(
    (ad) =>
      ad.status === 'active' &&
      ad.placement === 'story_open' &&
      (ad.is_global || ad.neighborhood_id === neighborhoodId)
  );
}
