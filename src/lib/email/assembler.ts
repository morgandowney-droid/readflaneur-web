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
import { generateWeatherStory } from './weather-story';
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
  limit: number,
  pausedTopics: string[] = []
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
      // Filter out paused topics (but never filter Daily Brief)
      const filtered = pausedTopics.length > 0
        ? data.filter(s => {
            const label = (s.category_label || '').toLowerCase();
            if (label.includes('daily brief')) return true; // Always keep Daily Brief
            return !pausedTopics.some(pt => label.includes(pt.toLowerCase()));
          })
        : data;

      // Sort: Daily Brief articles first, then by recency
      const sorted = filtered.sort((a, b) => {
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
 * Fetch the latest neighborhood brief and convert to an EmailStory.
 * First checks for a brief article in the articles table (links to full article page).
 * Falls back to neighborhood_briefs table and creates an article on-the-fly so the
 * email link always goes to a full article page (not the yellow brief card).
 */
async function fetchBriefAsStory(
  supabase: SupabaseClient,
  neighborhoodId: string,
  neighborhoodName: string,
  cityName: string
): Promise<EmailStory | null> {
  // First: check for a brief article in the articles table
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: briefArticle } = await supabase
    .from('articles')
    .select('headline, preview_text, image_url, category_label, slug, neighborhood_id')
    .eq('status', 'published')
    .eq('neighborhood_id', neighborhoodId)
    .ilike('category_label', '%daily brief%')
    .gte('published_at', since48h)
    .order('published_at', { ascending: false })
    .limit(1)
    .single();

  if (briefArticle) {
    return toEmailStory(briefArticle, neighborhoodName, cityName);
  }

  // Fallback: use neighborhood_briefs table and create an article on-the-fly
  const { data: brief } = await supabase
    .from('neighborhood_briefs')
    .select('id, headline, content, enriched_content, generated_at')
    .eq('neighborhood_id', neighborhoodId)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!brief) return null;

  // Create an article from the brief so the email link goes to a full article page
  const articleBody = brief.enriched_content || brief.content;
  const articleHeadline = `${neighborhoodName} DAILY BRIEF: ${brief.headline}`;
  const date = new Date().toISOString().split('T')[0];
  const headlineSlug = brief.headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  const slug = `${neighborhoodId}-brief-${date}-${headlineSlug}`;

  // Generate preview text from content
  const previewText = articleBody
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
    .substring(0, 200) + (articleBody.length > 200 ? '...' : '');

  // Check if an article with this slug already exists (from a previous email run)
  const { data: existingArticle } = await supabase
    .from('articles')
    .select('headline, preview_text, image_url, category_label, slug, neighborhood_id')
    .eq('slug', slug)
    .single();

  if (existingArticle) {
    return toEmailStory(existingArticle, neighborhoodName, cityName);
  }

  // Create the article so the email link goes to a full article page
  const { data: newArticle } = await supabase
    .from('articles')
    .insert({
      neighborhood_id: neighborhoodId,
      headline: articleHeadline,
      body_text: articleBody,
      preview_text: previewText,
      slug,
      status: 'published',
      published_at: brief.generated_at || new Date().toISOString(),
      author_type: 'ai',
      ai_model: 'grok-3-fast',
      article_type: 'brief_summary',
      category_label: `${neighborhoodName} Daily Brief`,
      brief_id: brief.id,
      image_url: '',
    })
    .select('headline, preview_text, image_url, category_label, slug, neighborhood_id')
    .single();

  if (newArticle) {
    return toEmailStory(newArticle, neighborhoodName, cityName);
  }

  // If insert failed for any reason, still build a valid link to the article slug
  return toEmailStory({
    headline: articleHeadline,
    preview_text: previewText,
    image_url: '',
    category_label: `${neighborhoodName} Daily Brief`,
    slug,
    neighborhood_id: neighborhoodId,
  }, neighborhoodName, cityName);
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
  const { primaryNeighborhoodId, subscribedNeighborhoodIds, pausedTopics } = recipient;

  // Fetch all subscribed neighborhoods from DB
  const { data: neighborhoods } = await supabase
    .from('neighborhoods')
    .select('id, name, city, country, latitude, longitude, is_combo')
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
    const stories = await fetchStories(supabase, queryIds, PRIMARY_STORY_COUNT, pausedTopics);

    // Fetch weather (current conditions for widget fallback)
    const neighborhoodCountry = primaryNeighborhood.country || 'USA';
    let weather = null;
    if (primaryNeighborhood.latitude && primaryNeighborhood.longitude) {
      weather = await fetchWeather(
        primaryNeighborhood.latitude,
        primaryNeighborhood.longitude,
        recipient.timezone,
        neighborhoodCountry
      );
    }

    // Generate editorial weather story (replaces widget when triggered)
    let weatherStory = null;
    if (primaryNeighborhood.latitude && primaryNeighborhood.longitude) {
      weatherStory = await generateWeatherStory(
        primaryNeighborhood.latitude,
        primaryNeighborhood.longitude,
        recipient.timezone,
        primaryNeighborhood.city,
        neighborhoodCountry
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
      weatherStory,
      stories: emailStories,
    };
  }

  // Build satellite sections
  const satelliteSections: SatelliteNeighborhoodSection[] = [];
  for (const satId of satelliteIds) {
    const neighborhood = neighborhoodMap.get(satId);
    if (!neighborhood) continue;

    const queryIds = await getNeighborhoodIdsForQuery(supabase, satId);
    const stories = await fetchStories(supabase, queryIds, SATELLITE_STORY_COUNT, pausedTopics);
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
 * Also strips bare neighborhood name prefix: "West Village Vibes: ..." → "Vibes: ..."
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
  // Strip bare neighborhood name prefix if headline starts with it
  // e.g., "West Village Vibes: Thai Gems..." → "Vibes: Thai Gems..."
  // e.g., "Nantucket Buzz: Reopenings..." → "Buzz: Reopenings..."
  cleaned = cleaned.replace(
    new RegExp(`^${escapeRegex(neighborhoodName)}\\s+`, 'i'),
    ''
  );
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
