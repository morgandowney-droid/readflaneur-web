/**
 * RSS News Sources for Neighborhood Content
 *
 * Aggregates local news from RSS feeds and filters for neighborhood relevance.
 * Sources are managed via database (rss_sources table) with fallback to hardcoded list.
 */

import { createClient } from '@supabase/supabase-js';

export interface RSSFeed {
  url: string;
  name: string;
  city: string;
  country: string;
  category: 'news' | 'lifestyle' | 'food' | 'culture' | 'real-estate';
}

interface DBRSSSource {
  id: string;
  city: string;
  name: string;
  feed_url: string;
  is_active: boolean;
}

export interface RSSItem {
  title: string;
  description?: string;
  link: string;
  pubDate: string;
  source: string;
  city: string;
}

// RSS feeds organized by city
export const RSS_FEEDS: RSSFeed[] = [
  // NEW YORK
  { url: 'https://gothamist.com/feed', name: 'Gothamist', city: 'New York', country: 'USA', category: 'news' },
  { url: 'https://ny.eater.com/rss/index.xml', name: 'Eater NY', city: 'New York', country: 'USA', category: 'food' },
  { url: 'https://www.6sqft.com/feed/', name: '6sqft', city: 'New York', country: 'USA', category: 'real-estate' },
  { url: 'https://www.curbed.com/rss/index.xml', name: 'Curbed', city: 'New York', country: 'USA', category: 'real-estate' },
  { url: 'https://www.grubstreet.com/feed/rss/index.xml', name: 'Grub Street', city: 'New York', country: 'USA', category: 'food' },

  // SAN FRANCISCO
  { url: 'https://sfist.com/feed/', name: 'SFist', city: 'San Francisco', country: 'USA', category: 'news' },
  { url: 'https://sf.eater.com/rss/index.xml', name: 'Eater SF', city: 'San Francisco', country: 'USA', category: 'food' },
  { url: 'https://sfstandard.com/feed/', name: 'SF Standard', city: 'San Francisco', country: 'USA', category: 'news' },

  // LOS ANGELES
  { url: 'https://laist.com/rss', name: 'LAist', city: 'Los Angeles', country: 'USA', category: 'news' },
  { url: 'https://la.eater.com/rss/index.xml', name: 'Eater LA', city: 'Los Angeles', country: 'USA', category: 'food' },
  { url: 'https://www.lamag.com/feed/', name: 'Los Angeles Magazine', city: 'Los Angeles', country: 'USA', category: 'lifestyle' },

  // WASHINGTON DC
  { url: 'https://dcist.com/feed/', name: 'DCist', city: 'Washington DC', country: 'USA', category: 'news' },
  { url: 'https://dc.eater.com/rss/index.xml', name: 'Eater DC', city: 'Washington DC', country: 'USA', category: 'food' },
  { url: 'https://www.popville.com/feed/', name: 'PoPville', city: 'Washington DC', country: 'USA', category: 'news' },

  // CHICAGO
  { url: 'https://chi.eater.com/rss/index.xml', name: 'Eater Chicago', city: 'Chicago', country: 'USA', category: 'food' },
  { url: 'https://blockclubchicago.org/feed/', name: 'Block Club Chicago', city: 'Chicago', country: 'USA', category: 'news' },

  // MIAMI
  { url: 'https://miami.eater.com/rss/index.xml', name: 'Eater Miami', city: 'Miami', country: 'USA', category: 'food' },
  { url: 'https://thenewtropic.com/feed/', name: 'The New Tropic', city: 'Miami', country: 'USA', category: 'news' },

  // LONDON
  { url: 'https://london.eater.com/rss/index.xml', name: 'Eater London', city: 'London', country: 'UK', category: 'food' },
  { url: 'https://londonist.com/feed', name: 'Londonist', city: 'London', country: 'UK', category: 'news' },
  { url: 'https://www.standard.co.uk/rss', name: 'Evening Standard', city: 'London', country: 'UK', category: 'news' },

  // PARIS
  { url: 'https://paris.eater.com/rss/index.xml', name: 'Eater Paris', city: 'Paris', country: 'France', category: 'food' },
  { url: 'https://www.thelocal.fr/feed/', name: 'The Local France', city: 'Paris', country: 'France', category: 'news' },

  // BERLIN
  { url: 'https://www.exberliner.com/feed/', name: 'ExBerliner', city: 'Berlin', country: 'Germany', category: 'lifestyle' },
  { url: 'https://www.stilinberlin.de/feed/', name: 'Still in Berlin', city: 'Berlin', country: 'Germany', category: 'lifestyle' },

  // AMSTERDAM
  { url: 'https://www.iamsterdam.com/en/rss', name: 'I Amsterdam', city: 'Amsterdam', country: 'Netherlands', category: 'lifestyle' },
  { url: 'https://www.dutchnews.nl/feed/', name: 'Dutch News', city: 'Amsterdam', country: 'Netherlands', category: 'news' },

  // BARCELONA
  { url: 'https://www.thelocal.es/feed/', name: 'The Local Spain', city: 'Barcelona', country: 'Spain', category: 'news' },

  // TOKYO
  { url: 'https://tokyocheapo.com/feed/', name: 'Tokyo Cheapo', city: 'Tokyo', country: 'Japan', category: 'lifestyle' },
  { url: 'https://www.tokyoweekender.com/feed/', name: 'Tokyo Weekender', city: 'Tokyo', country: 'Japan', category: 'lifestyle' },
  { url: 'https://www.japantimes.co.jp/feed/', name: 'Japan Times', city: 'Tokyo', country: 'Japan', category: 'news' },

  // SYDNEY
  { url: 'https://www.smh.com.au/rss/feed.xml', name: 'Sydney Morning Herald', city: 'Sydney', country: 'Australia', category: 'news' },
  { url: 'https://concreteplayground.com/sydney/feed', name: 'Concrete Playground Sydney', city: 'Sydney', country: 'Australia', category: 'lifestyle' },

  // MELBOURNE
  { url: 'https://www.theage.com.au/rss/feed.xml', name: 'The Age', city: 'Melbourne', country: 'Australia', category: 'news' },
  { url: 'https://concreteplayground.com/melbourne/feed', name: 'Concrete Playground Melbourne', city: 'Melbourne', country: 'Australia', category: 'lifestyle' },

  // TORONTO
  { url: 'https://www.blogto.com/feed/', name: 'blogTO', city: 'Toronto', country: 'Canada', category: 'news' },
  { url: 'https://toronto.eater.com/rss/index.xml', name: 'Eater Toronto', city: 'Toronto', country: 'Canada', category: 'food' },

  // SINGAPORE
  { url: 'https://thehoneycombers.com/singapore/feed/', name: 'Honeycombers SG', city: 'Singapore', country: 'Singapore', category: 'lifestyle' },
  { url: 'https://www.straitstimes.com/news/singapore/rss.xml', name: 'Straits Times', city: 'Singapore', country: 'Singapore', category: 'news' },

  // HONG KONG
  { url: 'https://thehoneycombers.com/hong-kong/feed/', name: 'Honeycombers HK', city: 'Hong Kong', country: 'Hong Kong', category: 'lifestyle' },
  { url: 'https://hongkongfp.com/feed/', name: 'Hong Kong Free Press', city: 'Hong Kong', country: 'Hong Kong', category: 'news' },

  // DUBAI
  { url: 'https://whatson.ae/feed/', name: "What's On Dubai", city: 'Dubai', country: 'UAE', category: 'lifestyle' },
  { url: 'https://gulfnews.com/rss', name: 'Gulf News', city: 'Dubai', country: 'UAE', category: 'news' },

  // LISBON
  { url: 'https://www.theportugalnews.com/feed', name: 'Portugal News', city: 'Lisbon', country: 'Portugal', category: 'news' },

  // COPENHAGEN
  { url: 'https://www.thelocal.dk/feed/', name: 'The Local Denmark', city: 'Copenhagen', country: 'Denmark', category: 'news' },

  // STOCKHOLM
  { url: 'https://www.thelocal.se/feed/', name: 'The Local Sweden', city: 'Stockholm', country: 'Sweden', category: 'news' },

  // MILAN
  { url: 'https://www.thelocal.it/feed/', name: 'The Local Italy', city: 'Milan', country: 'Italy', category: 'news' },

  // TEL AVIV
  { url: 'https://www.timesofisrael.com/feed/', name: 'Times of Israel', city: 'Tel Aviv', country: 'Israel', category: 'news' },
];

/**
 * Parse RSS/Atom feed and extract items
 */
export async function fetchRSSFeed(feed: RSSFeed): Promise<RSSItem[]> {
  try {
    const response = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Flaneur/1.0 (neighborhood news aggregator)',
      },
    });

    if (!response.ok) {
      console.error(`RSS fetch failed for ${feed.name}: ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const items: RSSItem[] = [];

    // Try RSS 2.0 format first
    const rssItemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    for (const item of rssItemMatches.slice(0, 20)) {
      const title = extractTag(item, 'title');
      const link = extractTag(item, 'link') || extractTag(item, 'guid');
      const description = extractTag(item, 'description') || extractTag(item, 'content:encoded');
      const pubDate = extractTag(item, 'pubDate') || extractTag(item, 'dc:date');

      if (title && link) {
        items.push({
          title: cleanText(title),
          description: cleanText(description || '').slice(0, 500),
          link,
          pubDate: pubDate || new Date().toISOString(),
          source: feed.name,
          city: feed.city,
        });
      }
    }

    // If no RSS items found, try Atom format
    if (items.length === 0) {
      const atomEntryMatches = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
      for (const entry of atomEntryMatches.slice(0, 20)) {
        const title = extractTag(entry, 'title');
        const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["']/);
        const link = linkMatch?.[1];
        const summary = extractTag(entry, 'summary') || extractTag(entry, 'content');
        const published = extractTag(entry, 'published') || extractTag(entry, 'updated');

        if (title && link) {
          items.push({
            title: cleanText(title),
            description: cleanText(summary || '').slice(0, 500),
            link,
            pubDate: published || new Date().toISOString(),
            source: feed.name,
            city: feed.city,
          });
        }
      }
    }

    return items;
  } catch (error) {
    console.error(`RSS fetch error for ${feed.name}:`, error);
    return [];
  }
}

/**
 * Extract tag content from XML
 */
function extractTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match?.[1]?.trim() || null;
}

/**
 * Clean HTML and CDATA from text
 */
function cleanText(text: string): string {
  return text
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get RSS feeds from database for a city
 */
async function getFeedsFromDatabase(city: string): Promise<RSSFeed[] | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('rss_sources')
      .select('city, name, feed_url')
      .eq('city', city)
      .eq('is_active', true);

    if (error || !data || data.length === 0) {
      return null;
    }

    return data.map((source) => ({
      url: source.feed_url,
      name: source.name,
      city: source.city,
      country: '', // Not stored in DB
      category: 'news' as const,
    }));
  } catch {
    return null;
  }
}

/**
 * Fetch all feeds for a specific city
 * Tries database first, falls back to hardcoded list
 */
export async function fetchCityFeeds(city: string): Promise<RSSItem[]> {
  // Try database first
  let cityFeeds = await getFeedsFromDatabase(city);

  // Fall back to hardcoded list
  if (!cityFeeds || cityFeeds.length === 0) {
    cityFeeds = RSS_FEEDS.filter(f => f.city === city);
  }

  const allItems: RSSItem[] = [];

  for (const feed of cityFeeds) {
    const items = await fetchRSSFeed(feed);
    allItems.push(...items);
    // Rate limiting between feeds
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Sort by date, most recent first
  return allItems.sort((a, b) =>
    new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );
}

/**
 * Get feeds grouped by city
 */
export function getFeedsByCity(): Record<string, RSSFeed[]> {
  const byCity: Record<string, RSSFeed[]> = {};
  for (const feed of RSS_FEEDS) {
    if (!byCity[feed.city]) byCity[feed.city] = [];
    byCity[feed.city].push(feed);
  }
  return byCity;
}

/**
 * Get all unique cities with feeds
 */
export function getCitiesWithFeeds(): string[] {
  return [...new Set(RSS_FEEDS.map(f => f.city))];
}
