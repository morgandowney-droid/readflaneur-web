import { Article, Ad, FeedItem, AdPlacement } from '@/types';

export function injectAds(
  articles: Article[],
  ads: Ad[],
  neighborhoodIds: string[]
): FeedItem[] {
  // Filter ads: active, feed placement, and global OR matching any selected neighborhood
  const relevantAds = ads.filter(
    (ad) =>
      ad.status === 'active' &&
      (ad.placement === 'feed' || !ad.placement) && // Default to feed if no placement set
      (ad.is_global || (ad.neighborhood_id && neighborhoodIds.includes(ad.neighborhood_id)))
  );

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
