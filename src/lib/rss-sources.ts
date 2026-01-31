/**
 * RSS News Sources for Neighborhood Content
 *
 * Aggregates local news from RSS feeds and filters for neighborhood relevance.
 */

export interface RSSFeed {
  url: string;
  name: string;
  city: string;
  country: string;
  category: 'news' | 'lifestyle' | 'food' | 'culture' | 'real-estate';
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
  { url: 'https://www.timeout.com/newyork/rss', name: 'Time Out NYC', city: 'New York', country: 'USA', category: 'lifestyle' },
  { url: 'https://www.6sqft.com/feed/', name: '6sqft', city: 'New York', country: 'USA', category: 'real-estate' },
  { url: 'https://www.westvillagewestside.com/feed/', name: 'West Village West Side', city: 'New York', country: 'USA', category: 'news' },

  // SAN FRANCISCO
  { url: 'https://sfist.com/feed/', name: 'SFist', city: 'San Francisco', country: 'USA', category: 'news' },
  { url: 'https://sf.eater.com/rss/index.xml', name: 'Eater SF', city: 'San Francisco', country: 'USA', category: 'food' },
  { url: 'https://hoodline.com/atom/neighborhoods/pacific-heights', name: 'Hoodline', city: 'San Francisco', country: 'USA', category: 'news' },

  // LOS ANGELES
  { url: 'https://laist.com/feed', name: 'LAist', city: 'Los Angeles', country: 'USA', category: 'news' },
  { url: 'https://la.eater.com/rss/index.xml', name: 'Eater LA', city: 'Los Angeles', country: 'USA', category: 'food' },
  { url: 'https://www.timeout.com/los-angeles/rss', name: 'Time Out LA', city: 'Los Angeles', country: 'USA', category: 'lifestyle' },

  // WASHINGTON DC
  { url: 'https://dcist.com/feed/', name: 'DCist', city: 'Washington DC', country: 'USA', category: 'news' },
  { url: 'https://dc.eater.com/rss/index.xml', name: 'Eater DC', city: 'Washington DC', country: 'USA', category: 'food' },
  { url: 'https://www.popville.com/feed/', name: 'PoPville', city: 'Washington DC', country: 'USA', category: 'news' },

  // CHICAGO
  { url: 'https://chi.eater.com/rss/index.xml', name: 'Eater Chicago', city: 'Chicago', country: 'USA', category: 'food' },
  { url: 'https://blockclubchicago.org/feed/', name: 'Block Club Chicago', city: 'Chicago', country: 'USA', category: 'news' },

  // MIAMI
  { url: 'https://miami.eater.com/rss/index.xml', name: 'Eater Miami', city: 'Miami', country: 'USA', category: 'food' },
  { url: 'https://www.timeout.com/miami/rss', name: 'Time Out Miami', city: 'Miami', country: 'USA', category: 'lifestyle' },
  { url: 'https://thenewtropic.com/feed/', name: 'The New Tropic', city: 'Miami', country: 'USA', category: 'news' },

  // LONDON
  { url: 'https://london.eater.com/rss/index.xml', name: 'Eater London', city: 'London', country: 'UK', category: 'food' },
  { url: 'https://www.timeout.com/london/rss', name: 'Time Out London', city: 'London', country: 'UK', category: 'lifestyle' },
  { url: 'https://londonist.com/feed', name: 'Londonist', city: 'London', country: 'UK', category: 'news' },

  // PARIS
  { url: 'https://paris.eater.com/rss/index.xml', name: 'Eater Paris', city: 'Paris', country: 'France', category: 'food' },
  { url: 'https://www.timeout.com/paris/en/rss', name: 'Time Out Paris', city: 'Paris', country: 'France', category: 'lifestyle' },

  // BERLIN
  { url: 'https://www.exberliner.com/feed/', name: 'ExBerliner', city: 'Berlin', country: 'Germany', category: 'lifestyle' },
  { url: 'https://www.stilinberlin.de/feed/', name: 'Still in Berlin', city: 'Berlin', country: 'Germany', category: 'lifestyle' },

  // AMSTERDAM
  { url: 'https://www.iamsterdam.com/en/rss', name: 'I Amsterdam', city: 'Amsterdam', country: 'Netherlands', category: 'lifestyle' },

  // BARCELONA
  { url: 'https://www.timeout.com/barcelona/rss', name: 'Time Out Barcelona', city: 'Barcelona', country: 'Spain', category: 'lifestyle' },

  // TOKYO
  { url: 'https://www.timeout.com/tokyo/rss', name: 'Time Out Tokyo', city: 'Tokyo', country: 'Japan', category: 'lifestyle' },
  { url: 'https://tokyocheapo.com/feed/', name: 'Tokyo Cheapo', city: 'Tokyo', country: 'Japan', category: 'lifestyle' },
  { url: 'https://www.tokyoweekender.com/feed/', name: 'Tokyo Weekender', city: 'Tokyo', country: 'Japan', category: 'lifestyle' },

  // SYDNEY
  { url: 'https://www.timeout.com/sydney/rss', name: 'Time Out Sydney', city: 'Sydney', country: 'Australia', category: 'lifestyle' },
  { url: 'https://www.broadsheet.com.au/sydney/rss', name: 'Broadsheet Sydney', city: 'Sydney', country: 'Australia', category: 'lifestyle' },

  // MELBOURNE
  { url: 'https://www.timeout.com/melbourne/rss', name: 'Time Out Melbourne', city: 'Melbourne', country: 'Australia', category: 'lifestyle' },
  { url: 'https://www.broadsheet.com.au/melbourne/rss', name: 'Broadsheet Melbourne', city: 'Melbourne', country: 'Australia', category: 'lifestyle' },

  // TORONTO
  { url: 'https://www.blogto.com/feed/', name: 'blogTO', city: 'Toronto', country: 'Canada', category: 'news' },
  { url: 'https://toronto.eater.com/rss/index.xml', name: 'Eater Toronto', city: 'Toronto', country: 'Canada', category: 'food' },

  // SINGAPORE
  { url: 'https://www.timeout.com/singapore/rss', name: 'Time Out Singapore', city: 'Singapore', country: 'Singapore', category: 'lifestyle' },
  { url: 'https://sg.eater.com/rss/index.xml', name: 'Eater Singapore', city: 'Singapore', country: 'Singapore', category: 'food' },
  { url: 'https://thehoneycombers.com/singapore/feed/', name: 'Honeycombers SG', city: 'Singapore', country: 'Singapore', category: 'lifestyle' },

  // HONG KONG
  { url: 'https://www.timeout.com/hong-kong/rss', name: 'Time Out Hong Kong', city: 'Hong Kong', country: 'Hong Kong', category: 'lifestyle' },
  { url: 'https://thehoneycombers.com/hong-kong/feed/', name: 'Honeycombers HK', city: 'Hong Kong', country: 'Hong Kong', category: 'lifestyle' },

  // DUBAI
  { url: 'https://www.timeout.com/dubai/rss', name: 'Time Out Dubai', city: 'Dubai', country: 'UAE', category: 'lifestyle' },
  { url: 'https://whatson.ae/feed/', name: "What's On Dubai", city: 'Dubai', country: 'UAE', category: 'lifestyle' },

  // LISBON
  { url: 'https://www.timeout.com/lisbon/rss', name: 'Time Out Lisbon', city: 'Lisbon', country: 'Portugal', category: 'lifestyle' },

  // COPENHAGEN
  { url: 'https://www.timeout.com/copenhagen/rss', name: 'Time Out Copenhagen', city: 'Copenhagen', country: 'Denmark', category: 'lifestyle' },

  // STOCKHOLM
  { url: 'https://www.timeout.com/stockholm/rss', name: 'Time Out Stockholm', city: 'Stockholm', country: 'Sweden', category: 'lifestyle' },

  // MILAN
  { url: 'https://www.timeout.com/milan/rss', name: 'Time Out Milan', city: 'Milan', country: 'Italy', category: 'lifestyle' },
  { url: 'https://milano.eater.com/rss/index.xml', name: 'Eater Milan', city: 'Milan', country: 'Italy', category: 'food' },

  // TEL AVIV
  { url: 'https://www.timeout.com/israel/rss', name: 'Time Out Israel', city: 'Tel Aviv', country: 'Israel', category: 'lifestyle' },
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
 * Fetch all feeds for a specific city
 */
export async function fetchCityFeeds(city: string): Promise<RSSItem[]> {
  const cityFeeds = RSS_FEEDS.filter(f => f.city === city);
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
