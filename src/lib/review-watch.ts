/**
 * Review Watch Service
 *
 * Monitors major food publications for NEW reviews of restaurants within
 * Flâneur neighborhoods. We are curators - only positive/notable reviews.
 *
 * Data Sources:
 * - NYT Cooking / Pete Wells (NYC) - Critic's Pick badge
 * - The Infatuation (Global) - Score > 8.0
 * - Eater (City-Specific) - Heatmaps, Essential lists
 * - Michelin Guide - Stars, Bib Gourmand
 * - The Standard / Guardian (London) - Featured reviews
 *
 * Matching Logic:
 * 1. Detect new review URL from RSS/feed
 * 2. Scrape restaurant name and address
 * 3. Check if address falls in Flâneur neighborhood
 * 4. Sentiment check (only positive reviews)
 *
 * Story Generation: Gemini with "Validation" tone
 * "We knew it was good, now the world knows."
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AI_MODELS } from '@/config/ai-models';
import Parser from 'rss-parser';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { insiderPersona } from '@/lib/ai-persona';

// =============================================================================
// TYPES
// =============================================================================

export type ReviewSource =
  | 'NYT_Pete_Wells'
  | 'NYT_Dining'
  | 'The_Infatuation'
  | 'Eater'
  | 'Michelin'
  | 'Guardian'
  | 'Standard'
  | 'Timeout'
  | 'Bon_Appetit'
  | 'Food_Wine';

export type ReviewCity =
  | 'New_York'
  | 'London'
  | 'Paris'
  | 'Los_Angeles'
  | 'San_Francisco'
  | 'Chicago'
  | 'Miami'
  | 'Sydney'
  | 'Hong_Kong'
  | 'Tokyo';

export type ReviewTier = 'critic_pick' | 'starred' | 'bib_gourmand' | 'high_score' | 'featured' | 'essential';

export interface SourceConfig {
  name: string;
  source: ReviewSource;
  feedUrl: string;
  city: ReviewCity;
  scoreThreshold?: number; // For Infatuation-style numeric scores
  badgeSelectors?: string[]; // CSS selectors for badges/awards
  positiveIndicators: string[]; // Keywords indicating positive review
  negativeIndicators: string[]; // Keywords to exclude
}

export interface DetectedReview {
  id: string;
  source: ReviewSource;
  sourceDisplayName: string;
  city: ReviewCity;
  restaurantName: string;
  restaurantAddress?: string;
  neighborhood?: string;
  neighborhoodId?: string;
  reviewUrl: string;
  publishedAt: Date;
  score?: number;
  tier: ReviewTier;
  criticName?: string;
  excerpt?: string;
  cuisine?: string;
  priceRange?: string;
  isPositive: boolean;
}

export interface ReviewStory {
  review: DetectedReview;
  headline: string;
  body: string;
  previewText: string;
  targetNeighborhoods: string[];
  categoryLabel: string;
  generatedAt: string;
}

export interface ReviewProcessResult {
  feedsChecked: number;
  reviewsDetected: number;
  reviewsMatched: number;
  storiesGenerated: number;
  bySource: Record<string, number>;
  byCity: Record<string, number>;
  stories: ReviewStory[];
  errors: string[];
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * RSS/Atom feed configurations for each publication
 */
export const REVIEW_SOURCES: SourceConfig[] = [
  // New York Times
  {
    name: 'NYT Restaurant Reviews',
    source: 'NYT_Pete_Wells',
    feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/DiningandWine.xml',
    city: 'New_York',
    positiveIndicators: ["critic's pick", 'worth a trip', 'excellent', 'outstanding', 'remarkable'],
    negativeIndicators: ['disappointing', 'overpriced', 'mediocre', 'skip', 'not worth'],
  },

  // The Infatuation - Multiple Cities
  {
    name: 'The Infatuation NYC',
    source: 'The_Infatuation',
    feedUrl: 'https://www.theinfatuation.com/new-york/feeds/reviews.rss',
    city: 'New_York',
    scoreThreshold: 8.0,
    positiveIndicators: ['perfect for', 'go here', 'worth it', 'one of the best'],
    negativeIndicators: ['skip', 'avoid', 'not worth', 'disappointing'],
  },
  {
    name: 'The Infatuation LA',
    source: 'The_Infatuation',
    feedUrl: 'https://www.theinfatuation.com/los-angeles/feeds/reviews.rss',
    city: 'Los_Angeles',
    scoreThreshold: 8.0,
    positiveIndicators: ['perfect for', 'go here', 'worth it', 'one of the best'],
    negativeIndicators: ['skip', 'avoid', 'not worth', 'disappointing'],
  },
  {
    name: 'The Infatuation SF',
    source: 'The_Infatuation',
    feedUrl: 'https://www.theinfatuation.com/san-francisco/feeds/reviews.rss',
    city: 'San_Francisco',
    scoreThreshold: 8.0,
    positiveIndicators: ['perfect for', 'go here', 'worth it', 'one of the best'],
    negativeIndicators: ['skip', 'avoid', 'not worth', 'disappointing'],
  },
  {
    name: 'The Infatuation Chicago',
    source: 'The_Infatuation',
    feedUrl: 'https://www.theinfatuation.com/chicago/feeds/reviews.rss',
    city: 'Chicago',
    scoreThreshold: 8.0,
    positiveIndicators: ['perfect for', 'go here', 'worth it', 'one of the best'],
    negativeIndicators: ['skip', 'avoid', 'not worth', 'disappointing'],
  },
  {
    name: 'The Infatuation London',
    source: 'The_Infatuation',
    feedUrl: 'https://www.theinfatuation.com/london/feeds/reviews.rss',
    city: 'London',
    scoreThreshold: 8.0,
    positiveIndicators: ['perfect for', 'go here', 'worth it', 'one of the best'],
    negativeIndicators: ['skip', 'avoid', 'not worth', 'disappointing'],
  },

  // Eater - City-specific
  {
    name: 'Eater NYC',
    source: 'Eater',
    feedUrl: 'https://ny.eater.com/rss/index.xml',
    city: 'New_York',
    positiveIndicators: ['heatmap', 'essential', 'best new', 'hottest', 'where to eat'],
    negativeIndicators: ['closing', 'shutters', 'disappointing'],
  },
  {
    name: 'Eater LA',
    source: 'Eater',
    feedUrl: 'https://la.eater.com/rss/index.xml',
    city: 'Los_Angeles',
    positiveIndicators: ['heatmap', 'essential', 'best new', 'hottest', 'where to eat'],
    negativeIndicators: ['closing', 'shutters', 'disappointing'],
  },
  {
    name: 'Eater SF',
    source: 'Eater',
    feedUrl: 'https://sf.eater.com/rss/index.xml',
    city: 'San_Francisco',
    positiveIndicators: ['heatmap', 'essential', 'best new', 'hottest', 'where to eat'],
    negativeIndicators: ['closing', 'shutters', 'disappointing'],
  },
  {
    name: 'Eater London',
    source: 'Eater',
    feedUrl: 'https://london.eater.com/rss/index.xml',
    city: 'London',
    positiveIndicators: ['heatmap', 'essential', 'best new', 'hottest', 'where to eat'],
    negativeIndicators: ['closing', 'shutters', 'disappointing'],
  },

  // The Guardian (UK)
  {
    name: 'Guardian Restaurant Reviews',
    source: 'Guardian',
    feedUrl: 'https://www.theguardian.com/lifeandstyle/series/jayraynerrestaurantreview/rss',
    city: 'London',
    positiveIndicators: ['brilliant', 'outstanding', 'worth the trip', 'exceptional', 'delicious'],
    negativeIndicators: ['disappointing', 'overpriced', 'mediocre', 'avoid'],
  },

  // Timeout
  {
    name: 'Time Out London Food',
    source: 'Timeout',
    feedUrl: 'https://www.timeout.com/london/restaurants/rss',
    city: 'London',
    positiveIndicators: ['best', 'must-visit', 'essential', 'outstanding'],
    negativeIndicators: ['disappointing', 'skip'],
  },
  {
    name: 'Time Out NYC Food',
    source: 'Timeout',
    feedUrl: 'https://www.timeout.com/newyork/restaurants/rss',
    city: 'New_York',
    positiveIndicators: ['best', 'must-visit', 'essential', 'outstanding'],
    negativeIndicators: ['disappointing', 'skip'],
  },

  // Bon Appétit
  {
    name: 'Bon Appétit Reviews',
    source: 'Bon_Appetit',
    feedUrl: 'https://www.bonappetit.com/feed/rss',
    city: 'New_York', // National but NYC-focused
    positiveIndicators: ['worth the trip', 'best', 'outstanding', 'exceptional'],
    negativeIndicators: ['disappointing', 'skip'],
  },
];

/**
 * City to Flâneur neighborhood mapping
 */
export const CITY_NEIGHBORHOODS: Record<ReviewCity, string[]> = {
  New_York: [
    'nyc-upper-east-side',
    'nyc-upper-west-side',
    'nyc-tribeca',
    'nyc-west-village',
    'nyc-greenwich-village',
    'nyc-soho',
    'nyc-chelsea',
    'nyc-hudson-yards',
    'nyc-meatpacking',
    'nyc-fidi',
    'nyc-williamsburg',
  ],
  London: [
    'london-mayfair',
    'london-chelsea',
    'london-kensington',
    'london-notting-hill',
    'london-hampstead',
    'london-shoreditch',
    'london-soho',
  ],
  Paris: [
    'paris-7th-arrondissement',
    'paris-16th-arrondissement',
    'paris-le-marais',
    'paris-saint-germain',
  ],
  Los_Angeles: [
    'la-beverly-hills',
    'la-bel-air',
    'la-malibu',
    'la-pacific-palisades',
    'la-brentwood',
    'la-santa-monica',
    'la-west-hollywood',
    'la-silver-lake',
  ],
  San_Francisco: [
    'sf-pacific-heights',
    'sf-marina',
    'sf-noe-valley',
    'sf-russian-hill',
    'sf-mission',
  ],
  Chicago: [
    'chicago-gold-coast',
    'chicago-lincoln-park',
    'chicago-river-north',
    'chicago-wicker-park',
  ],
  Miami: [
    'miami-south-beach',
    'miami-brickell',
    'miami-design-district',
    'miami-coral-gables',
  ],
  Sydney: [
    'sydney-double-bay',
    'sydney-mosman',
    'sydney-vaucluse',
    'sydney-paddington',
    'sydney-surry-hills',
  ],
  Hong_Kong: ['hk-central', 'hk-the-peak', 'hk-soho'],
  Tokyo: ['tokyo-roppongi', 'tokyo-shibuya', 'tokyo-ginza', 'tokyo-azabu'],
};

/**
 * Neighborhood name patterns for address matching
 */
export const NEIGHBORHOOD_PATTERNS: Record<string, RegExp[]> = {
  // NYC
  'nyc-upper-east-side': [/upper east side/i, /\bues\b/i, /east\s+\d{2}(th|st|nd|rd)\s+st/i],
  'nyc-upper-west-side': [/upper west side/i, /\buws\b/i, /west\s+\d{2}(th|st|nd|rd)\s+st/i],
  'nyc-tribeca': [/tribeca/i, /tri-?beca/i],
  'nyc-west-village': [/west village/i, /w\.?\s*village/i, /bleecker/i, /christopher st/i],
  'nyc-greenwich-village': [/greenwich village/i, /the village/i, /washington sq/i],
  'nyc-soho': [/\bsoho\b/i, /spring st/i, /prince st/i, /broome st/i],
  'nyc-chelsea': [/\bchelsea\b/i, /west\s+2[0-9](th|st|nd|rd)/i],
  'nyc-hudson-yards': [/hudson yards/i, /hudson yard/i],
  'nyc-meatpacking': [/meatpacking/i, /meat-?packing/i, /gansevoort/i],
  'nyc-fidi': [/financial district/i, /\bfidi\b/i, /wall st/i],
  'nyc-williamsburg': [/williamsburg/i, /w'?burg/i],

  // London
  'london-mayfair': [/mayfair/i, /bond st/i, /grosvenor/i],
  'london-chelsea': [/\bchelsea\b/i, /kings? road/i, /sloane/i],
  'london-kensington': [/kensington/i, /high st ken/i],
  'london-notting-hill': [/notting hill/i, /portobello/i],
  'london-hampstead': [/hampstead/i],
  'london-shoreditch': [/shoreditch/i, /hoxton/i],
  'london-soho': [/\bsoho\b/i, /wardour/i, /old compton/i],

  // LA
  'la-beverly-hills': [/beverly hills/i, /rodeo dr/i],
  'la-santa-monica': [/santa monica/i],
  'la-west-hollywood': [/west hollywood/i, /\bweho\b/i, /sunset strip/i],
  'la-silver-lake': [/silver lake/i],
  'la-malibu': [/malibu/i, /pch/i],

  // SF
  'sf-pacific-heights': [/pacific heights/i, /pac heights/i],
  'sf-marina': [/\bmarina\b/i, /chestnut st/i],
  'sf-mission': [/\bmission\b/i, /valencia st/i],
  'sf-noe-valley': [/noe valley/i],

  // Chicago
  'chicago-gold-coast': [/gold coast/i],
  'chicago-lincoln-park': [/lincoln park/i],
  'chicago-river-north': [/river north/i],
  'chicago-wicker-park': [/wicker park/i],
};

/**
 * Tier display names and priority
 */
export const TIER_CONFIG: Record<ReviewTier, { displayName: string; priority: number }> = {
  starred: { displayName: 'Michelin Star', priority: 1 },
  bib_gourmand: { displayName: 'Bib Gourmand', priority: 2 },
  critic_pick: { displayName: "Critic's Pick", priority: 3 },
  high_score: { displayName: 'Top Rated', priority: 4 },
  essential: { displayName: 'Essential', priority: 5 },
  featured: { displayName: 'Featured', priority: 6 },
};

// =============================================================================
// RSS FEED PARSING
// =============================================================================

const rssParser = new Parser({
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['dc:creator', 'creator'],
    ],
  },
});

/**
 * Fetch and parse RSS feed
 */
export async function fetchReviewFeed(config: SourceConfig): Promise<DetectedReview[]> {
  const reviews: DetectedReview[] = [];

  try {
    const feed = await rssParser.parseURL(config.feedUrl);
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const item of feed.items || []) {
      // Only process recent items (last 24 hours)
      const pubDate = item.pubDate ? new Date(item.pubDate) : now;
      if (pubDate < oneDayAgo) continue;

      // Check if this is a restaurant review (not news, not closing announcements)
      const title = item.title || '';
      const content = item.contentEncoded || item.content || item.contentSnippet || '';
      const fullText = `${title} ${content}`.toLowerCase();

      // Skip if contains negative indicators
      const hasNegative = config.negativeIndicators.some((neg) => fullText.includes(neg.toLowerCase()));
      if (hasNegative) continue;

      // Check for positive indicators (reviews, not news)
      const hasPositive = config.positiveIndicators.some((pos) => fullText.includes(pos.toLowerCase()));
      const isReview = /review/i.test(title) || /restaurant/i.test(title) || hasPositive;
      if (!isReview) continue;

      // Extract restaurant name from title
      const restaurantName = extractRestaurantName(title, config.source);
      if (!restaurantName) continue;

      // Try to match to a neighborhood
      const neighborhoodMatch = matchToNeighborhood(fullText, config.city);

      // Determine tier
      const tier = determineTier(fullText, config);

      const review: DetectedReview = {
        id: `${config.source}-${Buffer.from(item.link || title).toString('base64').substring(0, 16)}`,
        source: config.source,
        sourceDisplayName: config.name,
        city: config.city,
        restaurantName,
        neighborhood: neighborhoodMatch?.name,
        neighborhoodId: neighborhoodMatch?.id,
        reviewUrl: item.link || '',
        publishedAt: pubDate,
        tier,
        criticName: item.creator,
        excerpt: item.contentSnippet?.substring(0, 200),
        isPositive: hasPositive || !hasNegative,
      };

      // Only include if positive and matched to neighborhood
      if (review.isPositive && review.neighborhoodId) {
        reviews.push(review);
      }
    }
  } catch (error) {
    console.error(`Error fetching feed ${config.feedUrl}:`, error);
  }

  return reviews;
}

/**
 * Extract restaurant name from review title
 */
function extractRestaurantName(title: string, source: ReviewSource): string | null {
  // Common patterns:
  // "Review: Restaurant Name" or "Restaurant Name Review"
  // "At Restaurant Name, ..."
  // "Restaurant Name Is ..."
  // "'Restaurant Name' in Neighborhood"

  const patterns = [
    /^review:\s*(.+?)(?:\s+is|\s+in|\s*$)/i,
    /^at\s+(.+?),/i,
    /^(.+?)\s+review/i,
    /^'(.+?)'/,
    /^"(.+?)"/,
    /^(.+?)\s+is\s+/i,
    /^(.+?)\s+gets\s+/i,
    /^(.+?)\s+earns\s+/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      // Clean up the name
      let name = match[1].trim();
      // Remove common suffixes
      name = name.replace(/\s*(restaurant|review|nyc|london|la)$/i, '').trim();
      if (name.length > 2 && name.length < 100) {
        return name;
      }
    }
  }

  // Fallback: use first part of title before common separators
  const fallback = title.split(/[:\-–—|,]/)[0].trim();
  if (fallback.length > 2 && fallback.length < 50) {
    return fallback;
  }

  return null;
}

/**
 * Match content to a Flâneur neighborhood
 */
function matchToNeighborhood(
  text: string,
  city: ReviewCity
): { id: string; name: string } | null {
  const cityNeighborhoods = CITY_NEIGHBORHOODS[city] || [];

  for (const neighborhoodId of cityNeighborhoods) {
    const patterns = NEIGHBORHOOD_PATTERNS[neighborhoodId];
    if (!patterns) continue;

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        // Convert ID to display name
        const name = neighborhoodId
          .split('-')
          .slice(1)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        return { id: neighborhoodId, name };
      }
    }
  }

  // If no specific match, assign to all neighborhoods in the city
  // (the review is relevant to all local foodies)
  if (cityNeighborhoods.length > 0) {
    return {
      id: cityNeighborhoods[0], // Primary neighborhood
      name: city.replace(/_/g, ' '),
    };
  }

  return null;
}

/**
 * Determine the tier/award level of the review
 */
function determineTier(text: string, config: SourceConfig): ReviewTier {
  const lowerText = text.toLowerCase();

  // Michelin indicators
  if (/michelin star/i.test(text) || /\bstar\b.*restaurant/i.test(text)) {
    return 'starred';
  }
  if (/bib gourmand/i.test(text)) {
    return 'bib_gourmand';
  }

  // NYT Critic's Pick
  if (/critic'?s?\s*pick/i.test(text)) {
    return 'critic_pick';
  }

  // Infatuation high score
  if (config.scoreThreshold) {
    const scoreMatch = text.match(/(\d+\.?\d*)\s*(?:out of\s*)?(?:\/\s*)?10/i);
    if (scoreMatch) {
      const score = parseFloat(scoreMatch[1]);
      if (score >= config.scoreThreshold) {
        return 'high_score';
      }
    }
  }

  // Essential/Heatmap
  if (/essential/i.test(text) || /heatmap/i.test(text)) {
    return 'essential';
  }

  return 'featured';
}

// =============================================================================
// GEMINI STORY GENERATION
// =============================================================================

/**
 * Generate a review story using Gemini
 * Tone: "Validation" - "We knew it was good, now the world knows."
 */
export async function generateReviewStory(review: DetectedReview): Promise<ReviewStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: AI_MODELS.GEMINI_FLASH });

  const tierDisplay = TIER_CONFIG[review.tier].displayName;
  const neighborhoodName = review.neighborhood || review.city.replace(/_/g, ' ');

  // Build source-specific context
  let sourceContext = '';
  let headlineTemplate = '';

  switch (review.source) {
    case 'NYT_Pete_Wells':
    case 'NYT_Dining':
      sourceContext = 'The New York Times is the paper of record. A positive review here changes everything.';
      headlineTemplate = `Critic's Pick: The Times Reviews ${review.restaurantName}`;
      break;
    case 'The_Infatuation':
      sourceContext = 'The Infatuation is the trusted voice of millennial diners. A high score here means instant credibility.';
      headlineTemplate = `Top Rated: The Infatuation Reviews ${review.restaurantName}`;
      break;
    case 'Eater':
      sourceContext = 'Eater is the pulse of the restaurant industry. Appearing on a heatmap or essential list is a coronation.';
      headlineTemplate = `Essential: ${review.restaurantName} Makes the List`;
      break;
    case 'Michelin':
      sourceContext = 'A Michelin recognition is the highest honor in dining. This is global validation.';
      headlineTemplate = `${tierDisplay}: ${review.restaurantName} Earns Recognition`;
      break;
    case 'Guardian':
      sourceContext = "The Guardian's critics are brutally honest. A positive review here is hard-won.";
      headlineTemplate = `Critic's Choice: Guardian Reviews ${review.restaurantName}`;
      break;
    default:
      sourceContext = 'A major publication has taken notice. The secret is officially out.';
      headlineTemplate = `Critic's Pick: ${review.restaurantName} Gets Reviewed`;
  }

  const prompt = `${insiderPersona(neighborhoodName, 'Dining Editor')}
Data: ${JSON.stringify({
    restaurant: review.restaurantName,
    source: review.sourceDisplayName,
    tier: tierDisplay,
    critic: review.criticName,
    excerpt: review.excerpt,
    neighborhood: neighborhoodName,
  })}

Context:
- A major critic just reviewed a local spot.
- Award/Recognition: ${tierDisplay}
- ${sourceContext}
- Tone: 'Validation'. Think: "We knew it was good, now the world knows."
- Audience: Locals who pride themselves on knowing about places before they blow up.

Task: Write a blurb for Flâneur's Dining Watch.

Format your response as JSON:
{
  "headline": "${headlineTemplate}",
  "body": "[35-40 word blurb. Mention the restaurant, the source, and the recognition. End with something about reservations being harder to get. Tone: knowing, not gushing.]",
  "previewText": "[12-15 word teaser for feed cards]",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 2-3 link candidates for key entities mentioned in the body (restaurant name, publication name).

Constraints:
- Headline should be under 60 characters
- Body must mention the specific source (e.g., "The Times", "The Infatuation")
- Don't use exclamation points
- Tone is insider validation, not PR speak`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Extract JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in Gemini response for review story');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract and validate link candidates
    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);

    // Get body and inject hyperlinks
    let body = parsed.body || `${review.restaurantName} just earned recognition from ${review.sourceDisplayName}. Reservations may be harder to come by.`;
    if (linkCandidates.length > 0) {
      const cityName = review.city.replace(/_/g, ' ');
      body = injectHyperlinks(body, linkCandidates, { name: neighborhoodName, city: cityName });
    }

    // Get all neighborhoods in the city for syndication
    const targetNeighborhoods = review.neighborhoodId
      ? [review.neighborhoodId]
      : CITY_NEIGHBORHOODS[review.city] || [];

    return {
      review,
      headline: parsed.headline || headlineTemplate,
      body,
      previewText: parsed.previewText || `${review.sourceDisplayName} reviews ${review.restaurantName}`,
      targetNeighborhoods,
      categoryLabel: 'Dining Watch',
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error generating review story:', error);
    return null;
  }
}

// =============================================================================
// MAIN PROCESSING PIPELINE
// =============================================================================

/**
 * Process all review feeds
 */
export async function processReviewWatch(): Promise<ReviewProcessResult> {
  const result: ReviewProcessResult = {
    feedsChecked: 0,
    reviewsDetected: 0,
    reviewsMatched: 0,
    storiesGenerated: 0,
    bySource: {},
    byCity: {},
    stories: [],
    errors: [],
  };

  // Track seen restaurants to avoid duplicates
  const seenRestaurants = new Set<string>();

  for (const config of REVIEW_SOURCES) {
    result.feedsChecked++;

    try {
      const reviews = await fetchReviewFeed(config);
      result.reviewsDetected += reviews.length;

      for (const review of reviews) {
        // Skip if we've already processed this restaurant
        const restaurantKey = `${review.restaurantName.toLowerCase()}-${review.city}`;
        if (seenRestaurants.has(restaurantKey)) continue;
        seenRestaurants.add(restaurantKey);

        // Only process if matched to a neighborhood
        if (!review.neighborhoodId) continue;

        result.reviewsMatched++;
        result.bySource[review.source] = (result.bySource[review.source] || 0) + 1;
        result.byCity[review.city] = (result.byCity[review.city] || 0) + 1;

        // Generate story
        const story = await generateReviewStory(review);
        if (story) {
          result.stories.push(story);
          result.storiesGenerated++;
        }

        // Rate limit
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      result.errors.push(`${config.name}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Rate limit between feeds
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return result;
}

// =============================================================================
// SAMPLE DATA FOR TESTING
// =============================================================================

/**
 * Create sample reviews for testing
 */
export function createSampleReviews(): DetectedReview[] {
  return [
    {
      id: 'sample-nyt-1',
      source: 'NYT_Pete_Wells',
      sourceDisplayName: 'New York Times',
      city: 'New_York',
      restaurantName: 'Torrisi',
      restaurantAddress: '275 Mulberry St, New York, NY',
      neighborhood: 'SoHo',
      neighborhoodId: 'nyc-soho',
      reviewUrl: 'https://nytimes.com/review/torrisi',
      publishedAt: new Date(),
      tier: 'critic_pick',
      criticName: 'Pete Wells',
      excerpt: 'A return to form for the team behind Carbone...',
      cuisine: 'Italian-American',
      priceRange: '$$$$',
      isPositive: true,
    },
    {
      id: 'sample-infatuation-1',
      source: 'The_Infatuation',
      sourceDisplayName: 'The Infatuation',
      city: 'Los_Angeles',
      restaurantName: 'Mother Wolf',
      restaurantAddress: '1545 Wilcox Ave, Los Angeles, CA',
      neighborhood: 'Hollywood',
      neighborhoodId: 'la-west-hollywood',
      reviewUrl: 'https://theinfatuation.com/los-angeles/reviews/mother-wolf',
      publishedAt: new Date(),
      score: 8.7,
      tier: 'high_score',
      excerpt: 'Roman pasta perfection in a gorgeous setting...',
      cuisine: 'Italian',
      priceRange: '$$$',
      isPositive: true,
    },
    {
      id: 'sample-guardian-1',
      source: 'Guardian',
      sourceDisplayName: 'The Guardian',
      city: 'London',
      restaurantName: 'Kol',
      restaurantAddress: '9 Seymour St, London W1H 7JW',
      neighborhood: 'Mayfair',
      neighborhoodId: 'london-mayfair',
      reviewUrl: 'https://theguardian.com/food/kol-review',
      publishedAt: new Date(),
      tier: 'starred',
      criticName: 'Jay Rayner',
      excerpt: 'Mexican fine dining that justifies every penny...',
      cuisine: 'Mexican',
      priceRange: '$$$$',
      isPositive: true,
    },
  ];
}
