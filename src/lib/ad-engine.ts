import { Article, Ad, FeedItem, AdPlacement } from '@/types';

// Ad frequency: show one ad every N articles
// This constant is also referenced in the advertise pricing page
export const AD_FREQUENCY = 6;

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
  const today = new Date().toISOString().split('T')[0];

  // Filter ads: active, feed placement, date-aware, and global OR matching any selected neighborhood
  let relevantAds = ads.filter(
    (ad) =>
      ad.status === 'active' &&
      (ad.placement === 'feed' || !ad.placement) && // Default to feed if no placement set
      (ad.is_global || (ad.neighborhood_id && neighborhoodIds.includes(ad.neighborhood_id))) &&
      // Date-aware: only show ads where today falls within start_date..end_date
      (!ad.start_date || ad.start_date <= today) &&
      (!ad.end_date || ad.end_date >= today)
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

  // Insert ad every AD_FREQUENCY articles
  const feed: FeedItem[] = [];
  let adIndex = 0;

  articles.forEach((article, i) => {
    feed.push({ type: 'article', data: article });
    if ((i + 1) % AD_FREQUENCY === 0 && relevantAds.length > 0) {
      feed.push({ type: 'ad', data: relevantAds[adIndex % relevantAds.length] });
      adIndex++;
    }
  });

  return feed;
}

export function getStoryOpenAds(ads: Ad[], neighborhoodId: string): Ad[] {
  const today = new Date().toISOString().split('T')[0];

  return ads.filter(
    (ad) =>
      ad.status === 'active' &&
      ad.placement === 'story_open' &&
      (ad.is_global || ad.neighborhood_id === neighborhoodId) &&
      (!ad.start_date || ad.start_date <= today) &&
      (!ad.end_date || ad.end_date >= today)
  );
}
