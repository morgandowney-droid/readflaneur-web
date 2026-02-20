/**
 * Daily Brief Email Assembler
 * Assembles the content payload for a single recipient's daily brief
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { CITY_PREFIX_MAP } from '@/lib/neighborhood-utils';
import {
  EmailRecipient,
  DailyBriefContent,
  PrimaryNeighborhoodSection,
  SatelliteNeighborhoodSection,
  EmailStory,
  FamilyCornerSection,
} from './types';
import { fetchWeather } from './weather';
import { generateWeatherStory } from './weather-story';
import { getEmailAds } from './ads';
import { getUniqueBands } from '@/lib/childcare/age-bands';

// Each section gets exactly 1 Daily Brief + 1 Look Ahead

/**
 * Expand a neighborhood ID to include combo component IDs.
 * For combo neighborhoods, articles may be stored under component IDs.
 * Returns an array of IDs to query with `.in()`.
 */
async function expandNeighborhoodIds(
  supabase: SupabaseClient,
  neighborhoodId: string,
  isCombo?: boolean
): Promise<string[]> {
  if (!isCombo) return [neighborhoodId];
  const { data } = await supabase
    .from('combo_neighborhoods')
    .select('component_id')
    .eq('combo_id', neighborhoodId);
  const componentIds = (data || []).map(r => r.component_id);
  return [neighborhoodId, ...componentIds];
}

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
  // First: check for a brief article in the articles table (14h window = today's brief only)
  // Using 14h instead of 48h prevents stale briefs from blocking fresh ones
  const since14h = new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString();
  const { data: briefArticle } = await supabase
    .from('articles')
    .select('headline, preview_text, body_text, image_url, category_label, slug, neighborhood_id, published_at, created_at')
    .eq('status', 'published')
    .eq('neighborhood_id', neighborhoodId)
    .ilike('category_label', '%daily brief%')
    .gte('published_at', since14h)
    .order('published_at', { ascending: false })
    .limit(1)
    .single();

  if (briefArticle) {
    return toEmailStory(briefArticle, neighborhoodName, cityName);
  }

  // Fallback: use neighborhood_briefs table and create an article on-the-fly
  const { data: brief } = await supabase
    .from('neighborhood_briefs')
    .select('id, headline, content, enriched_content, enriched_categories, enrichment_model, model, generated_at')
    .eq('neighborhood_id', neighborhoodId)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!brief) return null;

  // Never create an article from an unenriched brief — wait for Gemini enrichment
  if (!brief.enriched_content) return null;

  // Create an article from the enriched brief so the email link goes to a full article page
  const articleBody = brief.enriched_content;
  const articleHeadline = `${neighborhoodName} DAILY BRIEF: ${brief.headline}`;
  const date = new Date().toISOString().split('T')[0];
  const headlineSlug = brief.headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  const slug = `${neighborhoodId}-brief-${date}-${headlineSlug}`;

  // Generate preview text from content, truncated at sentence boundary (no ellipsis)
  let previewText = articleBody
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
    .substring(0, 200);

  if (previewText.length >= 200) {
    const lastPeriod = previewText.lastIndexOf('.');
    const lastExcl = previewText.lastIndexOf('!');
    const lastQuestion = previewText.lastIndexOf('?');
    const lastEnd = Math.max(lastPeriod, lastExcl, lastQuestion);
    if (lastEnd > 0) {
      previewText = previewText.slice(0, lastEnd + 1);
    } else {
      const lastSpace = previewText.lastIndexOf(' ');
      if (lastSpace > 0) previewText = previewText.slice(0, lastSpace);
    }
  }

  // Check if an article with this slug already exists (from a previous email run)
  const { data: existingArticle } = await supabase
    .from('articles')
    .select('headline, preview_text, body_text, image_url, category_label, slug, neighborhood_id, published_at, created_at')
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
      ai_model: brief.model ? `${brief.model} + ${brief.enrichment_model || 'gemini'}` : 'grok + gemini',
      article_type: 'brief_summary',
      category_label: `${neighborhoodName} Daily Brief`,
      brief_id: brief.id,
      image_url: '',
      enriched_at: new Date().toISOString(),
      enrichment_model: brief.enrichment_model || 'gemini-2.5-flash',
    })
    .select('id, headline, preview_text, body_text, image_url, category_label, slug, neighborhood_id, published_at, created_at')
    .single();

  if (newArticle) {
    // Insert sources from enriched categories (best-effort)
    if (brief.enriched_categories && Array.isArray(brief.enriched_categories)) {
      const sources: { article_id: string; source_name: string; source_type: string; source_url?: string }[] = [];
      const seen = new Set<string>();
      for (const cat of brief.enriched_categories as any[]) {
        for (const story of cat.stories || []) {
          if (story.source?.name && !seen.has(story.source.name.toLowerCase())) {
            seen.add(story.source.name.toLowerCase());
            const url = story.source.url;
            const isValidUrl = url && !url.includes('google.com/search') && url.startsWith('http');
            sources.push({
              article_id: newArticle.id,
              source_name: story.source.name,
              source_type: story.source.name.startsWith('@') || url?.includes('x.com') ? 'x_user' : 'publication',
              source_url: isValidUrl ? url : undefined,
            });
          }
          if (story.secondarySource?.name && !seen.has(story.secondarySource.name.toLowerCase())) {
            seen.add(story.secondarySource.name.toLowerCase());
            const url = story.secondarySource.url;
            const isValidUrl = url && !url.includes('google.com/search') && url.startsWith('http');
            sources.push({
              article_id: newArticle.id,
              source_name: story.secondarySource.name,
              source_type: story.secondarySource.name.startsWith('@') || url?.includes('x.com') ? 'x_user' : 'publication',
              source_url: isValidUrl ? url : undefined,
            });
          }
        }
      }
      if (sources.length === 0) {
        sources.push(
          { article_id: newArticle.id, source_name: 'X (Twitter)', source_type: 'platform' },
          { article_id: newArticle.id, source_name: 'Google News', source_type: 'platform' },
        );
      }
      await supabase.from('article_sources').insert(sources).then(null, (e: Error) =>
        console.error(`[assembler] Failed to insert sources for ${newArticle.id}:`, e)
      );
    }
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
 * Fetch the latest Look Ahead article as an EmailStory.
 * Uses a 48h window to find the most recent look_ahead article.
 */
async function fetchLookAheadAsStory(
  supabase: SupabaseClient,
  neighborhoodId: string,
  neighborhoodName: string,
  cityName: string,
  isCombo?: boolean
): Promise<EmailStory | null> {
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const ids = await expandNeighborhoodIds(supabase, neighborhoodId, isCombo);
  const { data: lookAheadArticle } = await supabase
    .from('articles')
    .select('headline, preview_text, body_text, image_url, category_label, slug, neighborhood_id, published_at, created_at')
    .eq('status', 'published')
    .in('neighborhood_id', ids)
    .eq('article_type', 'look_ahead')
    .gte('published_at', since48h)
    .order('published_at', { ascending: false })
    .limit(1)
    .single();

  if (!lookAheadArticle) return null;

  return toEmailStory(lookAheadArticle, neighborhoodName, cityName);
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
 * Fetch the Look Ahead article URL for a neighborhood (last 48h).
 * Returns null if no Look Ahead article exists.
 */
async function fetchLookAheadUrl(
  supabase: SupabaseClient,
  neighborhoodId: string,
  cityName: string,
  isCombo?: boolean
): Promise<string | null> {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 48);

  const ids = await expandNeighborhoodIds(supabase, neighborhoodId, isCombo);
  const { data } = await supabase
    .from('articles')
    .select('slug, neighborhood_id')
    .in('neighborhood_id', ids)
    .eq('status', 'published')
    .eq('article_type', 'look_ahead')
    .gte('published_at', cutoff.toISOString())
    .order('published_at', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return null;

  // Use the actual article's neighborhood_id for the URL (may be a component)
  const base = neighborhoodIdToUrl(data[0].neighborhood_id, cityName);
  return `${base}/${data[0].slug}`;
}

/**
 * Fetch Family Corner content for a recipient (if opted in).
 * Returns null for non-opted-in users (zero cost).
 */
async function fetchFamilyCorner(
  supabase: SupabaseClient,
  recipientId: string,
  source: 'profile' | 'newsletter',
  neighborhoodId: string | null,
  neighborhoodName: string
): Promise<FamilyCornerSection | null> {
  if (!neighborhoodId) return null;

  // Check if childcare mode is enabled (early return for non-opted users)
  const table = source === 'newsletter' ? 'newsletter_subscribers' : 'profiles';
  const { data: user } = await supabase
    .from(table)
    .select('childcare_mode_enabled')
    .eq('id', recipientId)
    .single();

  if (!user?.childcare_mode_enabled) return null;

  // Fetch children
  const userSource = source === 'profile' ? 'profile' : 'newsletter';
  const { data: children } = await supabase
    .from('user_children')
    .select('birth_month, birth_year')
    .eq('user_id', recipientId)
    .eq('user_source', userSource);

  if (!children || children.length === 0) return null;

  const bands = getUniqueBands(children);
  if (bands.length === 0) return null;

  // Look up cached content for today
  const today = new Date().toISOString().split('T')[0];
  const { data: content } = await supabase
    .from('childcare_content')
    .select('headline, body_text, age_bands')
    .eq('neighborhood_id', neighborhoodId)
    .eq('content_date', today)
    .contains('age_bands', bands)
    .limit(1)
    .single();

  if (!content) return null;

  return {
    headline: content.headline,
    bodyText: content.body_text,
    ageBands: content.age_bands,
    neighborhoodName,
  };
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

    // Fetch exactly 1 Daily Brief + 1 Look Ahead
    const briefStory = await fetchBriefAsStory(supabase, primaryNeighborhood.id, primaryNeighborhood.name, primaryNeighborhood.city);
    const lookAheadStory = await fetchLookAheadAsStory(supabase, primaryNeighborhood.id, primaryNeighborhood.name, primaryNeighborhood.city, primaryNeighborhood.is_combo);

    const emailStories: EmailStory[] = [];
    if (briefStory) emailStories.push(briefStory);
    if (lookAheadStory) emailStories.push(lookAheadStory);

    if (emailStories.length === 0) {
      console.warn(`[assembler] No brief or look ahead found for primary ${primaryNeighborhood.id}`);
    } else if (emailStories.length === 1) {
      console.warn(`[assembler] Missing ${briefStory ? 'look ahead' : 'daily brief'} for primary ${primaryNeighborhood.id}`);
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

  // Collect article URLs from primary section for deduplication
  const seenArticleUrls = new Set<string>();
  if (primarySection) {
    for (const story of primarySection.stories) {
      seenArticleUrls.add(story.articleUrl);
    }
  }

  // Build satellite sections: exactly 1 Daily Brief + 1 Look Ahead each
  const satelliteSections: SatelliteNeighborhoodSection[] = [];
  for (const satId of satelliteIds) {
    const neighborhood = neighborhoodMap.get(satId);
    if (!neighborhood) continue;

    const briefStory = await fetchBriefAsStory(supabase, satId, neighborhood.name, neighborhood.city);
    const lookAheadStory = await fetchLookAheadAsStory(supabase, satId, neighborhood.name, neighborhood.city, neighborhood.is_combo);

    const emailStories: EmailStory[] = [];
    if (briefStory) emailStories.push(briefStory);
    if (lookAheadStory) emailStories.push(lookAheadStory);

    if (emailStories.length === 0) {
      console.warn(`[assembler] No brief or look ahead found for satellite ${satId}`);
    } else if (emailStories.length === 1) {
      console.warn(`[assembler] Missing ${briefStory ? 'look ahead' : 'daily brief'} for satellite ${satId}`);
    }

    // Deduplicate: remove stories already shown in primary or earlier satellites
    const dedupedStories = emailStories.filter(s => !seenArticleUrls.has(s.articleUrl));
    for (const s of dedupedStories) {
      seenArticleUrls.add(s.articleUrl);
    }

    if (dedupedStories.length > 0) {
      satelliteSections.push({
        neighborhoodId: neighborhood.id,
        neighborhoodName: neighborhood.name,
        cityName: neighborhood.city,
        stories: dedupedStories,
      });
    }
  }

  // Fetch ads
  const allIds = subscribedNeighborhoodIds;
  const { headerAd, nativeAd } = await getEmailAds(supabase, primaryNeighborhoodId, allIds);

  // Fetch Look Ahead URL for primary neighborhood
  let lookAheadUrl: string | null = null;
  if (primaryNeighborhood) {
    lookAheadUrl = await fetchLookAheadUrl(supabase, primaryNeighborhood.id, primaryNeighborhood.city, primaryNeighborhood.is_combo);
  }

  // Fetch Family Corner (zero cost for non-opted-in users)
  const familyCorner = await fetchFamilyCorner(
    supabase,
    recipient.id,
    recipient.source,
    primaryNeighborhoodId,
    primaryNeighborhood?.name || 'your neighborhood'
  );

  return {
    recipient,
    date: formatDateForTimezone(recipient.timezone),
    primarySection,
    satelliteSections,
    headerAd,
    nativeAd,
    lookAheadUrl,
    familyCorner,
  };
}

/**
 * Strip the neighborhood name prefix from a category label
 * e.g., "Beverly Hills Daily Brief" → "Daily Brief"
 * publishedAt is used to determine if "(Today)" is accurate
 */
function cleanCategoryLabel(label: string | null, neighborhoodName: string, publishedAt?: string): string | null {
  if (!label) return null;
  // Strip neighborhood name prefix (case-insensitive)
  let cleaned = label.replace(new RegExp(`^${escapeRegex(neighborhoodName)}\\s+`, 'i'), '');
  cleaned = cleaned || label;
  // Rename labels for email display
  if (/^Daily Brief$/i.test(cleaned)) {
    // Only say "(Today)" if the article was actually published today
    const isToday = publishedAt ? isSameDay(new Date(publishedAt), new Date()) : true;
    return isToday ? 'Daily Brief (Today)' : 'Daily Brief';
  }
  if (/^Look Ahead$/i.test(cleaned)) return 'Look Ahead (next 7 days)';
  return cleaned;
}

/** Check if two dates are the same calendar day */
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
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
  // Strip "Name LOOK AHEAD:" prefix (metadata already shows "Look Ahead")
  cleaned = cleaned.replace(
    new RegExp(`^${escapeRegex(neighborhoodName)}\\s+LOOK\\s+AHEAD\\s*:\\s*`, 'i'),
    ''
  );
  cleaned = cleaned.replace(/^[^:]*LOOK\s+AHEAD\s*:\s*/i, '');
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
 * Format a dateline suffix from a date string
 * e.g., "Mon Feb 12"
 */
function formatDateline(dateString?: string): string {
  const date = dateString ? new Date(dateString) : new Date();
  const day = date.toLocaleDateString('en-US', { weekday: 'short' });
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const dayNum = date.getDate();
  return `${day} ${month} ${dayNum}`;
}

/** Check if a preview text is just a greeting with no substance */
function isGreetingOnly(text: string): boolean {
  // Match patterns like "Good morning, Nolita." or "Bonjour, voisins." with nothing after
  const stripped = text.trim().replace(/\s+/g, ' ');
  // If it's a single short sentence (under 40 chars) that looks like a greeting
  if (stripped.length > 60) return false;
  return /^(good morning|god morgon|bonjour|buongiorno|guten morgen|buenos d[ií]as|bom dia|goedemorgen|morning|gr[üu]ezi)[,.]?\s*[^.!?]*[.!?]?\s*$/i.test(stripped);
}

/**
 * Split text into sentences, handling abbreviations and initials.
 * "The Solomon R. Guggenheim Museum opens." → ["The Solomon R. Guggenheim Museum opens."]
 * Not split on single-letter initials (A. B. C.) or common abbreviations (St. Dr. Mr.)
 */
function extractSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by a space and uppercase letter,
  // but NOT after single-letter initials or common abbreviations
  const sentences: string[] = [];
  // Regex: period/excl/question followed by space and uppercase, but not preceded by single letter
  const parts = text.split(/(?<=[^A-Z][.!?])\s+(?=[A-Z])/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length > 5) sentences.push(trimmed);
  }
  return sentences;
}

/**
 * Find the last real sentence boundary in text (not an initial like "R.")
 */
function findSentenceEnd(text: string): number {
  // Walk backwards to find a period/!/? that's a real sentence end
  for (let i = text.length - 1; i > 30; i--) {
    const ch = text[i];
    if (ch === '!' || ch === '?') return i;
    if (ch === '.' && i >= 2) {
      // Skip single-letter initials: check if preceded by space+letter
      const prev = text[i - 1];
      const prevPrev = i >= 2 ? text[i - 2] : '';
      if (/[A-Z]/.test(prev) && (prevPrev === ' ' || prevPrev === '.')) continue;
      return i;
    }
  }
  return -1;
}

/**
 * Convert a DB article row to an EmailStory
 */
function toEmailStory(
  article: {
    headline: string;
    preview_text: string;
    body_text?: string;
    image_url: string;
    category_label: string;
    slug: string;
    neighborhood_id: string;
    published_at?: string;
    created_at?: string;
  },
  neighborhoodName: string,
  cityName: string
): EmailStory {
  const cleanedLabel = cleanCategoryLabel(article.category_label, neighborhoodName, article.published_at);
  const dateline = formatDateline(article.published_at || article.created_at);
  const labelWithDate = cleanedLabel ? `${cleanedLabel} - ${dateline}` : null;

  // If preview text is just a greeting, extract 2-3 real sentences from body_text
  let previewText = article.preview_text || '';
  if (isGreetingOnly(previewText) && article.body_text) {
    const bodyPlain = article.body_text
      .replace(/\[\[[^\]]+\]\]/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n+/g, ' ')
      .trim();
    // Extract real sentences (skip greetings, skip single initials like "R.")
    const sentences = extractSentences(bodyPlain);
    const nonGreeting = sentences.filter(s => !isGreetingOnly(s));
    if (nonGreeting.length >= 2) {
      previewText = nonGreeting.slice(0, 2).join(' ');
    } else if (nonGreeting.length === 1) {
      previewText = nonGreeting[0];
    }
    // Truncate if too long
    if (previewText.length > 250) {
      const truncated = previewText.substring(0, 250);
      const lastEnd = findSentenceEnd(truncated);
      if (lastEnd > 50) previewText = truncated.slice(0, lastEnd + 1);
    }
  }

  return {
    headline: cleanHeadline(article.headline, neighborhoodName),
    previewText,
    imageUrl: article.image_url && !article.image_url.endsWith('.svg') ? article.image_url : null,
    categoryLabel: labelWithDate,
    articleUrl: buildArticleUrl(article.neighborhood_id, cityName, article.slug) + '?ref=email',
    location: `${neighborhoodName}, ${cityName}`,
  };
}
