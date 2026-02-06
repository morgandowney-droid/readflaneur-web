/**
 * Daily Brief Email Assembler
 * Assembles the content payload for a single recipient's daily brief
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getNeighborhoodIdsForQuery } from '@/lib/combo-utils';
import { CITY_PREFIX_MAP } from '@/lib/neighborhood-utils';
import {
  EmailRecipient,
  DailyBriefContent,
  PrimaryNeighborhoodSection,
  SatelliteNeighborhoodSection,
  EmailStory,
} from './types';
import { fetchWeather } from './weather';
import { getEmailAds } from './ads';

const PRIMARY_STORY_COUNT = 5;
const SATELLITE_STORY_COUNT = 2;

// Reverse map: neighborhood ID prefix -> city URL slug
const REVERSE_PREFIX_MAP: Record<string, string> = {};
for (const [slug, prefix] of Object.entries(CITY_PREFIX_MAP)) {
  // Only keep the first mapping (avoid vacation overrides)
  if (!REVERSE_PREFIX_MAP[prefix]) {
    REVERSE_PREFIX_MAP[prefix] = slug;
  }
}

/**
 * Convert a neighborhood ID to a URL path
 * e.g., 'nyc-west-village' -> '/new-york/west-village'
 */
function neighborhoodIdToUrl(id: string, city: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';

  // Find the city slug from the neighborhood ID prefix
  const parts = id.split('-');
  let prefix = parts[0];
  let neighborhoodSlug = parts.slice(1).join('-');

  // Some prefixes are two parts (e.g., there's no two-part prefix in current data, but handle it)
  let citySlug = REVERSE_PREFIX_MAP[prefix];

  // If not found, try using the city name directly
  if (!citySlug && city) {
    citySlug = city.toLowerCase().replace(/\s+/g, '-');
  }

  if (!citySlug) {
    citySlug = prefix;
    neighborhoodSlug = parts.slice(1).join('-');
  }

  return `${appUrl}/${citySlug}/${neighborhoodSlug}`;
}

/**
 * Build article URL from neighborhood and article slug
 */
function buildArticleUrl(
  neighborhoodId: string,
  cityName: string,
  articleSlug: string
): string {
  const base = neighborhoodIdToUrl(neighborhoodId, cityName);
  return `${base}/${articleSlug}`;
}

/**
 * Fetch recent articles for given neighborhood IDs
 * Tries 24h, then 48h, then 7d lookback windows
 */
async function fetchStories(
  supabase: SupabaseClient,
  neighborhoodIds: string[],
  limit: number
): Promise<{ id: string; headline: string; preview_text: string; image_url: string; category_label: string; slug: string; neighborhood_id: string }[]> {
  const lookbacks = [24, 48, 168]; // hours
  // Fetch extra to ensure Daily Brief is included even if not in top N by recency
  const fetchLimit = Math.max(limit + 3, 8);

  for (const hours of lookbacks) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from('articles')
      .select('id, headline, preview_text, image_url, category_label, slug, neighborhood_id')
      .eq('status', 'published')
      .in('neighborhood_id', neighborhoodIds)
      .gte('published_at', since)
      .order('published_at', { ascending: false })
      .limit(fetchLimit);

    if (data && data.length > 0) {
      // Sort: Daily Brief articles first, then by recency
      const sorted = data.sort((a, b) => {
        const aIsBrief = (a.category_label || '').toLowerCase().includes('daily brief') ? 0 : 1;
        const bIsBrief = (b.category_label || '').toLowerCase().includes('daily brief') ? 0 : 1;
        return aIsBrief - bIsBrief;
      });
      return sorted.slice(0, limit);
    }
  }

  return [];
}

/**
 * Fetch the latest neighborhood brief from the neighborhood_briefs table
 * and convert it to a synthetic article-like object for email inclusion.
 * This ensures every neighborhood gets a Daily Brief even if no article exists.
 */
async function fetchBriefAsStory(
  supabase: SupabaseClient,
  neighborhoodId: string,
  neighborhoodName: string,
  cityName: string
): Promise<EmailStory | null> {
  const { data: brief } = await supabase
    .from('neighborhood_briefs')
    .select('headline, content')
    .eq('neighborhood_id', neighborhoodId)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!brief) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';
  const parts = neighborhoodId.split('-');
  const prefix = parts[0];
  const neighborhoodSlug = parts.slice(1).join('-');
  const citySlug = REVERSE_PREFIX_MAP[prefix] || cityName.toLowerCase().replace(/\s+/g, '-');

  // Strip markdown citations like [[1]](url) from content for preview
  const plainContent = brief.content
    .replace(/\[\[\d+\]\]\([^)]*\)/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  const previewText = plainContent.length > 200 ? plainContent.slice(0, 200) + '...' : plainContent;

  return {
    headline: cleanHeadline(brief.headline, neighborhoodName),
    previewText,
    imageUrl: null,
    categoryLabel: 'Daily Brief',
    articleUrl: `${appUrl}/${citySlug}/${neighborhoodSlug}?ref=email`,
    location: `${neighborhoodName}, ${cityName}`,
  };
}

/**
 * Format date string for the email header
 */
function formatDateForTimezone(timezone: string): string {
  try {
    const now = new Date();
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    }).format(now);
  } catch {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}

/**
 * Assemble the complete daily brief content for one recipient
 */
export async function assembleDailyBrief(
  supabase: SupabaseClient,
  recipient: EmailRecipient
): Promise<DailyBriefContent> {
  const { primaryNeighborhoodId, subscribedNeighborhoodIds } = recipient;

  // Fetch all subscribed neighborhoods from DB
  const { data: neighborhoods } = await supabase
    .from('neighborhoods')
    .select('id, name, city, latitude, longitude, is_combo')
    .in('id', subscribedNeighborhoodIds);

  const neighborhoodMap = new Map(
    (neighborhoods || []).map(n => [n.id, n])
  );

  // Separate primary from satellites
  const primaryNeighborhood = primaryNeighborhoodId
    ? neighborhoodMap.get(primaryNeighborhoodId)
    : null;

  const satelliteIds = subscribedNeighborhoodIds.filter(
    id => id !== primaryNeighborhoodId
  );

  // Build primary section
  let primarySection: PrimaryNeighborhoodSection | null = null;
  if (primaryNeighborhood) {
    // Expand combo neighborhoods
    const queryIds = await getNeighborhoodIdsForQuery(supabase, primaryNeighborhood.id);
    const stories = await fetchStories(supabase, queryIds, PRIMARY_STORY_COUNT);

    // Fetch weather
    let weather = null;
    if (primaryNeighborhood.latitude && primaryNeighborhood.longitude) {
      weather = await fetchWeather(
        primaryNeighborhood.latitude,
        primaryNeighborhood.longitude,
        recipient.timezone
      );
    }

    const emailStories = stories.map(s => toEmailStory(s, primaryNeighborhood.name, primaryNeighborhood.city));

    // If no Daily Brief article exists, pull from neighborhood_briefs table
    const hasBrief = emailStories.some(s => s.categoryLabel?.toLowerCase().includes('daily brief'));
    if (!hasBrief) {
      const briefStory = await fetchBriefAsStory(supabase, primaryNeighborhood.id, primaryNeighborhood.name, primaryNeighborhood.city);
      if (briefStory) {
        emailStories.unshift(briefStory);
        // Keep within limit
        if (emailStories.length > PRIMARY_STORY_COUNT) {
          emailStories.length = PRIMARY_STORY_COUNT;
        }
      }
    }

    primarySection = {
      neighborhoodId: primaryNeighborhood.id,
      neighborhoodName: primaryNeighborhood.name,
      cityName: primaryNeighborhood.city,
      weather,
      stories: emailStories,
    };
  }

  // Build satellite sections
  const satelliteSections: SatelliteNeighborhoodSection[] = [];
  for (const satId of satelliteIds) {
    const neighborhood = neighborhoodMap.get(satId);
    if (!neighborhood) continue;

    const queryIds = await getNeighborhoodIdsForQuery(supabase, satId);
    const stories = await fetchStories(supabase, queryIds, SATELLITE_STORY_COUNT);
    const emailStories = stories.map(s => toEmailStory(s, neighborhood.name, neighborhood.city));

    // If no Daily Brief article exists, pull from neighborhood_briefs table
    const hasBrief = emailStories.some(s => s.categoryLabel?.toLowerCase().includes('daily brief'));
    if (!hasBrief) {
      const briefStory = await fetchBriefAsStory(supabase, satId, neighborhood.name, neighborhood.city);
      if (briefStory) {
        emailStories.unshift(briefStory);
        // Keep within limit + 1 (brief is always included)
        if (emailStories.length > SATELLITE_STORY_COUNT + 1) {
          emailStories.length = SATELLITE_STORY_COUNT + 1;
        }
      }
    }

    if (emailStories.length > 0) {
      satelliteSections.push({
        neighborhoodId: neighborhood.id,
        neighborhoodName: neighborhood.name,
        cityName: neighborhood.city,
        stories: emailStories,
      });
    }
  }

  // Fetch ads
  const allIds = subscribedNeighborhoodIds;
  const { headerAd, nativeAd } = await getEmailAds(supabase, primaryNeighborhoodId, allIds);

  return {
    recipient,
    date: formatDateForTimezone(recipient.timezone),
    primarySection,
    satelliteSections,
    headerAd,
    nativeAd,
  };
}

/**
 * Strip the neighborhood name prefix from a category label
 * e.g., "Beverly Hills Daily Brief" → "Daily Brief"
 */
function cleanCategoryLabel(label: string | null, neighborhoodName: string): string | null {
  if (!label) return null;
  // Strip neighborhood name prefix (case-insensitive)
  const cleaned = label.replace(new RegExp(`^${escapeRegex(neighborhoodName)}\\s+`, 'i'), '');
  return cleaned || label;
}

/**
 * Strip redundant neighborhood/daily brief prefix from headline
 * e.g., "Beverly Hills DAILY BRIEF: Bev Hills Buzz: ..." → "Bev Hills Buzz: ..."
 */
function cleanHeadline(headline: string, neighborhoodName: string): string {
  // Strip patterns like "Beverly Hills DAILY BRIEF:" or "Beverly Hills Daily Brief:"
  let cleaned = headline.replace(
    new RegExp(`^${escapeRegex(neighborhoodName)}\\s+DAILY\\s+BRIEF\\s*:\\s*`, 'i'),
    ''
  );
  // Also handle abbreviated neighborhood names (e.g., "Bev Hills DAILY BRIEF:")
  // by stripping any "... DAILY BRIEF:" prefix
  cleaned = cleaned.replace(/^[^:]*DAILY\s+BRIEF\s*:\s*/i, '');
  return cleaned || headline;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert a DB article row to an EmailStory
 */
function toEmailStory(
  article: {
    headline: string;
    preview_text: string;
    image_url: string;
    category_label: string;
    slug: string;
    neighborhood_id: string;
  },
  neighborhoodName: string,
  cityName: string
): EmailStory {
  return {
    headline: cleanHeadline(article.headline, neighborhoodName),
    previewText: article.preview_text || '',
    imageUrl: article.image_url && !article.image_url.endsWith('.svg') ? article.image_url : null,
    categoryLabel: cleanCategoryLabel(article.category_label, neighborhoodName),
    articleUrl: buildArticleUrl(article.neighborhood_id, cityName, article.slug) + '?ref=email',
    location: `${neighborhoodName}, ${cityName}`,
  };
}
