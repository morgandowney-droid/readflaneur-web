/**
 * Social Media Sources for Spotted
 *
 * Monitors social platforms for neighborhood mentions and sightings.
 */

import { NEIGHBORHOOD_COORDS } from './event-sources';

export interface RawSocialPost {
  content: string;
  author?: string;
  url?: string;
  platform: string;
  external_id: string;
  posted_at: string;
  engagement?: number;
  location_hint?: string;
  has_media: boolean;
}

// Neighborhood hashtags and keywords for monitoring
export const NEIGHBORHOOD_KEYWORDS: Record<string, { hashtags: string[]; subreddits: string[]; keywords: string[] }> = {
  'nyc-west-village': {
    hashtags: ['#westvillage', '#westvillagenyc', '#greenwichvillage', '#wvnyc'],
    subreddits: ['r/nyc', 'r/westvillage', 'r/newyorkcity'],
    keywords: ['west village', 'bleecker street', 'christopher street', 'perry street', 'hudson street'],
  },
  'london-notting-hill': {
    hashtags: ['#nottinghill', '#nottinghilllondon', '#portobelloroad', '#w11'],
    subreddits: ['r/london', 'r/nottinghill'],
    keywords: ['notting hill', 'portobello road', 'westbourne grove', 'ladbroke grove'],
  },
  'sf-pacific-heights': {
    hashtags: ['#pacificheights', '#pacheights', '#sfpacificheights', '#fillmorestreet'],
    subreddits: ['r/sanfrancisco', 'r/bayarea'],
    keywords: ['pacific heights', 'fillmore street', 'sacramento street', 'pac heights'],
  },
  'stockholm-ostermalm': {
    hashtags: ['#östermalm', '#ostermalm', '#stureplan', '#stockholmcity'],
    subreddits: ['r/stockholm', 'r/sweden'],
    keywords: ['östermalm', 'stureplan', 'karlaplan', 'humlegården'],
  },
  'sydney-paddington': {
    hashtags: ['#paddington', '#paddingtonsydney', '#oxfordstreet', '#fiveways'],
    subreddits: ['r/sydney', 'r/australia'],
    keywords: ['paddington sydney', 'oxford street paddington', 'five ways paddington'],
  },
};

/**
 * Fetch posts from Reddit
 */
export async function fetchRedditPosts(
  neighborhoodId: string,
  sinceHours: number = 24
): Promise<RawSocialPost[]> {
  const config = NEIGHBORHOOD_KEYWORDS[neighborhoodId];
  if (!config) return [];

  const posts: RawSocialPost[] = [];

  for (const subreddit of config.subreddits) {
    try {
      // Reddit's public JSON API (no auth needed for public posts)
      const response = await fetch(
        `https://www.reddit.com/${subreddit}/new.json?limit=50`,
        {
          headers: {
            'User-Agent': 'Flaneur/1.0 (neighborhood news aggregator)',
          },
        }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const children = data?.data?.children || [];

      const cutoffTime = Date.now() - sinceHours * 60 * 60 * 1000;

      for (const child of children) {
        const post = child.data;
        const postedAt = post.created_utc * 1000;

        if (postedAt < cutoffTime) continue;

        // Check if post mentions the neighborhood
        const content = `${post.title} ${post.selftext || ''}`.toLowerCase();
        const isRelevant = config.keywords.some(kw => content.includes(kw.toLowerCase()));

        if (!isRelevant) continue;

        posts.push({
          content: post.title + (post.selftext ? `\n\n${post.selftext.slice(0, 500)}` : ''),
          author: post.author,
          url: `https://reddit.com${post.permalink}`,
          platform: 'reddit',
          external_id: post.id,
          posted_at: new Date(postedAt).toISOString(),
          engagement: post.score + post.num_comments,
          has_media: !!post.url && !post.is_self,
        });
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Reddit fetch error for ${subreddit}:`, error);
    }
  }

  return posts;
}

/**
 * Fetch recent Google reviews mentioning specific topics
 * (Uses Google Places API to get reviews for businesses in the area)
 */
export async function fetchGoogleReviewMentions(
  neighborhoodId: string,
  keywords: string[] = ['line', 'wait', 'closed', 'opening', 'crowded', 'packed']
): Promise<RawSocialPost[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const coords = NEIGHBORHOOD_COORDS[neighborhoodId];
  if (!coords) return [];

  const posts: RawSocialPost[] = [];

  try {
    // Search for popular places
    const searchResponse = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName',
      },
      body: JSON.stringify({
        includedTypes: ['restaurant', 'cafe', 'bar'],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: coords.lat, longitude: coords.lng },
            radius: coords.radius * 1000,
          },
        },
        rankPreference: 'POPULARITY',
      }),
    });

    if (!searchResponse.ok) return posts;

    const searchData = await searchResponse.json();
    const places = searchData.places?.slice(0, 10) || [];

    // Get reviews for each place
    for (const place of places) {
      try {
        const detailsResponse = await fetch(
          `https://places.googleapis.com/v1/places/${place.id}`,
          {
            headers: {
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'displayName,reviews',
            },
          }
        );

        if (!detailsResponse.ok) continue;

        const details = await detailsResponse.json();
        const reviews = details.reviews || [];

        for (const review of reviews) {
          const text = review.text?.text || '';
          const lowerText = text.toLowerCase();

          // Check if review mentions relevant keywords
          const isRelevant = keywords.some(kw => lowerText.includes(kw));
          if (!isRelevant) continue;

          posts.push({
            content: `${place.displayName?.text}: "${text.slice(0, 300)}"`,
            platform: 'google_review',
            external_id: `google-${place.id}-${review.name || Date.now()}`,
            posted_at: review.publishTime || new Date().toISOString(),
            has_media: false,
            location_hint: place.displayName?.text,
          });
        }

        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error fetching reviews for ${place.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Google reviews fetch error:', error);
  }

  return posts;
}

/**
 * Fetch from Twitter/X API (requires API access)
 */
export async function fetchTwitterPosts(
  neighborhoodId: string,
  sinceHours: number = 6
): Promise<RawSocialPost[]> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    console.log('Twitter API not configured');
    return [];
  }

  const config = NEIGHBORHOOD_KEYWORDS[neighborhoodId];
  if (!config) return [];

  const posts: RawSocialPost[] = [];

  // Build search query from hashtags and keywords
  const query = [
    ...config.hashtags.slice(0, 2),
    ...config.keywords.slice(0, 2).map(k => `"${k}"`),
  ].join(' OR ');

  try {
    const params = new URLSearchParams({
      'query': `(${query}) -is:retweet lang:en`,
      'max_results': '50',
      'tweet.fields': 'created_at,public_metrics,geo',
      'expansions': 'author_id',
    });

    const response = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error('Twitter API error:', response.status);
      return posts;
    }

    const data = await response.json();
    const tweets = data.data || [];

    const cutoffTime = Date.now() - sinceHours * 60 * 60 * 1000;

    for (const tweet of tweets) {
      const postedAt = new Date(tweet.created_at).getTime();
      if (postedAt < cutoffTime) continue;

      posts.push({
        content: tweet.text,
        url: `https://twitter.com/i/status/${tweet.id}`,
        platform: 'twitter',
        external_id: tweet.id,
        posted_at: tweet.created_at,
        engagement: (tweet.public_metrics?.like_count || 0) + (tweet.public_metrics?.retweet_count || 0),
        has_media: false,
      });
    }
  } catch (error) {
    console.error('Twitter fetch error:', error);
  }

  return posts;
}

/**
 * Fetch from Instagram (requires Meta API access)
 */
export async function fetchInstagramPosts(
  neighborhoodId: string
): Promise<RawSocialPost[]> {
  // Instagram API requires business account and Meta approval
  // Placeholder for future implementation
  return [];
}

/**
 * Combine posts from all social sources
 */
export async function fetchAllSocialPosts(
  neighborhoodId: string,
  sinceHours: number = 24
): Promise<RawSocialPost[]> {
  const [redditPosts, googleReviews, twitterPosts] = await Promise.all([
    fetchRedditPosts(neighborhoodId, sinceHours),
    fetchGoogleReviewMentions(neighborhoodId),
    fetchTwitterPosts(neighborhoodId, Math.min(sinceHours, 6)), // Twitter search is limited
  ]);

  // Combine and sort by engagement/recency
  const allPosts = [...redditPosts, ...googleReviews, ...twitterPosts];

  return allPosts.sort((a, b) => {
    // Sort by engagement first, then by recency
    const engagementDiff = (b.engagement || 0) - (a.engagement || 0);
    if (engagementDiff !== 0) return engagementDiff;
    return new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime();
  });
}

/**
 * Filter posts for "spotted-worthy" content
 */
export function filterSpottedContent(posts: RawSocialPost[]): RawSocialPost[] {
  const spottedKeywords = [
    // Crowds/Lines
    'line out', 'waiting', 'packed', 'crowded', 'empty', 'no wait',
    // Changes
    'closed', 'closing', 'opened', 'opening', 'new', 'construction', 'scaffolding',
    'renovation', 'for sale', 'for lease', 'moving out',
    // Sightings
    'spotted', 'saw', 'just saw', 'filming', 'photo shoot', 'celebrity',
    // Events
    'pop-up', 'popup', 'happening now', 'tonight', 'event',
  ];

  return posts.filter(post => {
    const content = post.content.toLowerCase();
    return spottedKeywords.some(kw => content.includes(kw));
  });
}
