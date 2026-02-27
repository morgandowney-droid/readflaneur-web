import { SupabaseClient } from '@supabase/supabase-js';
import type { PostcardSection } from './types';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\n$/, '').replace(/\/$/, '')
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

interface PostcardCandidate {
  neighborhoodId: string;
  neighborhoodName: string;
  cityName: string;
  country: string;
  imageUrl: string;
  teaser: string;
  articleUrl: string;
  score: number;
}

/** Filler text patterns to penalize */
function isFillerTeaser(text: string): boolean {
  const first = text.split(/[.!?]/)[0]?.toLowerCase().trim() || '';
  const fillerPatterns = [
    /^(here['\u2019]?s|it['\u2019]?s been|another|a crisp|right then)/,
    /^(good morning|morning,|hey there)/,
    /^(this week|this month|looking ahead)/,
  ];
  return fillerPatterns.some(p => p.test(first));
}

/** Count proper nouns (words starting with uppercase that aren't sentence starters) */
function countProperNouns(text: string): number {
  const words = text.split(/\s+/).slice(1); // skip first word (sentence start)
  return words.filter(w => /^[A-Z][a-z]/.test(w)).length;
}

/** Check for day/date references indicating timeliness */
function hasDateReference(text: string): boolean {
  return /\b(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text);
}

function scoreCandidate(candidate: PostcardCandidate, recentCities: Set<string>): number {
  let score = 0;

  // +5 proper nouns in teaser (specific event/name)
  score += Math.min(countProperNouns(candidate.teaser), 3) * 5;

  // +3 day/date reference (timeliness)
  if (hasDateReference(candidate.teaser)) score += 3;

  // +3 city NOT in 7-day recency / -10 if IS recent
  if (recentCities.has(candidate.cityName.toLowerCase())) {
    score -= 10;
  } else {
    score += 3;
  }

  // +2 teaser > 60 chars (information-dense)
  if (candidate.teaser.length > 60) score += 2;

  // -5 filler text
  if (isFillerTeaser(candidate.teaser)) score -= 5;

  return score;
}

/**
 * Select a single postcard for Daily Brief email.
 * Returns cached result if already selected today.
 */
export async function selectDailyPostcard(
  supabase: SupabaseClient
): Promise<PostcardSection | null> {
  const today = new Date().toISOString().split('T')[0];

  // 1. Check cache
  const { data: cached } = await supabase
    .from('email_postcards')
    .select('*')
    .eq('send_date', today)
    .eq('variant', 'daily')
    .limit(1)
    .single();

  if (cached) {
    return {
      neighborhoodName: cached.neighborhood_name,
      cityName: cached.city_name,
      country: cached.country,
      imageUrl: cached.image_url,
      teaser: cached.teaser,
      articleUrl: cached.article_url,
    };
  }

  // 2. Fetch 7-day city recency
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const { data: recentRows } = await supabase
    .from('email_postcards')
    .select('city_name')
    .gte('send_date', sevenDaysAgo);

  const recentCities = new Set(
    (recentRows || []).map(r => r.city_name.toLowerCase())
  );

  // 3. Build candidates
  const candidates = await buildCandidates(supabase);
  if (candidates.length === 0) return null;

  // 4. Score and pick top
  const scored = candidates.map(c => ({
    ...c,
    score: scoreCandidate(c, recentCities),
  }));
  scored.sort((a, b) => b.score - a.score);

  const winner = scored[0];

  // 5. Cache
  await supabase.from('email_postcards').upsert({
    send_date: today,
    variant: 'daily',
    neighborhood_id: winner.neighborhoodId,
    neighborhood_name: winner.neighborhoodName,
    city_name: winner.cityName,
    country: winner.country,
    image_url: winner.imageUrl,
    teaser: winner.teaser,
    article_url: winner.articleUrl,
    score: winner.score,
  }, { onConflict: 'send_date,variant,neighborhood_id' });

  return {
    neighborhoodName: winner.neighborhoodName,
    cityName: winner.cityName,
    country: winner.country,
    imageUrl: winner.imageUrl,
    teaser: winner.teaser,
    articleUrl: winner.articleUrl,
  };
}

/**
 * Select 3 postcards for Sunday Edition email.
 * Each pick removes its city from the pool for diversity.
 */
export async function selectSundayPostcards(
  supabase: SupabaseClient
): Promise<PostcardSection[] | null> {
  const today = new Date().toISOString().split('T')[0];

  // 1. Check cache
  const { data: cached } = await supabase
    .from('email_postcards')
    .select('*')
    .eq('send_date', today)
    .eq('variant', 'sunday')
    .order('score', { ascending: false })
    .limit(3);

  if (cached && cached.length >= 2) {
    return cached.map(c => ({
      neighborhoodName: c.neighborhood_name,
      cityName: c.city_name,
      country: c.country,
      imageUrl: c.image_url,
      teaser: c.teaser,
      articleUrl: c.article_url,
    }));
  }

  // 2. Fetch 7-day city recency
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const { data: recentRows } = await supabase
    .from('email_postcards')
    .select('city_name')
    .gte('send_date', sevenDaysAgo);

  const recentCities = new Set(
    (recentRows || []).map(r => r.city_name.toLowerCase())
  );

  // 3. Build and score candidates
  const candidates = await buildCandidates(supabase);
  if (candidates.length < 2) return null;

  const scored = candidates.map(c => ({
    ...c,
    score: scoreCandidate(c, recentCities),
  }));
  scored.sort((a, b) => b.score - a.score);

  // 4. Pick top 3, removing city after each pick
  const picks: PostcardCandidate[] = [];
  const usedCities = new Set<string>();

  for (const c of scored) {
    if (picks.length >= 3) break;
    const cityKey = c.cityName.toLowerCase();
    if (usedCities.has(cityKey)) continue;
    usedCities.add(cityKey);
    picks.push(c);
  }

  if (picks.length < 2) return null;

  // 5. Cache all picks
  for (const pick of picks) {
    await supabase.from('email_postcards').upsert({
      send_date: today,
      variant: 'sunday',
      neighborhood_id: pick.neighborhoodId,
      neighborhood_name: pick.neighborhoodName,
      city_name: pick.cityName,
      country: pick.country,
      image_url: pick.imageUrl,
      teaser: pick.teaser,
      article_url: pick.articleUrl,
      score: pick.score,
    }, { onConflict: 'send_date,variant,neighborhood_id' });
  }

  return picks.map(p => ({
    neighborhoodName: p.neighborhoodName,
    cityName: p.cityName,
    country: p.country,
    imageUrl: p.imageUrl,
    teaser: p.teaser,
    articleUrl: p.articleUrl,
  }));
}

/**
 * Build postcard candidates from recent briefs + articles with Unsplash images.
 */
async function buildCandidates(supabase: SupabaseClient): Promise<PostcardCandidate[]> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch candidate neighborhoods (active, non-combo, non-test)
  const { data: neighborhoods } = await supabase
    .from('neighborhoods')
    .select('id, name, city, country')
    .eq('is_active', true)
    .eq('is_combo', false)
    .neq('region', 'test')
    .limit(500);

  if (!neighborhoods || neighborhoods.length === 0) return [];

  const neighborhoodMap = new Map(
    neighborhoods.map(n => [n.id, n])
  );
  const neighborhoodIds = neighborhoods.map(n => n.id);

  // Fetch briefs with email_teaser from last 24h
  const { data: briefs } = await supabase
    .from('neighborhood_briefs')
    .select('neighborhood_id, email_teaser')
    .in('neighborhood_id', neighborhoodIds)
    .not('enriched_content', 'is', null)
    .not('email_teaser', 'is', null)
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(500);

  if (!briefs || briefs.length === 0) return [];

  // Fetch recent brief_summary articles with Unsplash images
  const briefNeighborhoodIds = [...new Set(briefs.map(b => b.neighborhood_id))];
  const { data: articles } = await supabase
    .from('articles')
    .select('id, neighborhood_id, slug, image_url, headline')
    .eq('article_type', 'brief_summary')
    .eq('status', 'published')
    .in('neighborhood_id', briefNeighborhoodIds)
    .like('image_url', '%unsplash.com%')
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(500);

  if (!articles || articles.length === 0) return [];

  // Build article map: neighborhood_id -> first article
  const articleMap = new Map<string, typeof articles[0]>();
  for (const a of articles) {
    if (!articleMap.has(a.neighborhood_id)) {
      articleMap.set(a.neighborhood_id, a);
    }
  }

  // Build candidates
  const candidates: PostcardCandidate[] = [];
  const seenNeighborhoods = new Set<string>();

  for (const brief of briefs) {
    if (seenNeighborhoods.has(brief.neighborhood_id)) continue;
    seenNeighborhoods.add(brief.neighborhood_id);

    const neighborhood = neighborhoodMap.get(brief.neighborhood_id);
    const article = articleMap.get(brief.neighborhood_id);
    if (!neighborhood || !article) continue;

    const citySlug = neighborhood.city.toLowerCase().replace(/\s+/g, '-');
    const neighborhoodSlug = neighborhood.id.replace(/^[^-]+-/, '');
    const articleUrl = `${BASE_URL}/${citySlug}/${neighborhoodSlug}/${article.slug}?explore=true`;

    candidates.push({
      neighborhoodId: neighborhood.id,
      neighborhoodName: neighborhood.name,
      cityName: neighborhood.city,
      country: neighborhood.country || '',
      imageUrl: article.image_url,
      teaser: brief.email_teaser,
      articleUrl,
      score: 0,
    });
  }

  return candidates;
}
