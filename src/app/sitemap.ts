import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';

const BASE_URL = 'https://readflaneur.com';

// Regenerate the sitemap at most once per day (avoids a DB query per crawl hit).
export const revalidate = 86400;

/**
 * Dynamic sitemap: static pages + every active neighborhood page + the most
 * recent published articles. robots.ts already points crawlers here.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/destinations`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/discover`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/partner`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE_URL}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE_URL}/careers`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE_URL}/legal`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE_URL}/standards`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return staticPages;

  try {
    const supabase = createClient(supabaseUrl, serviceKey);

    // One page per active neighborhood. region='test' = admin-only Irish
    // syndication entities (no public page) - exclude them.
    const { data: neighborhoods } = await supabase
      .from('neighborhoods')
      .select('id, region')
      .eq('is_active', true);

    const publicNeighborhoodIds = new Set(
      (neighborhoods || [])
        .filter((n) => n.region !== 'test')
        .map((n) => n.id),
    );

    const neighborhoodPages: MetadataRoute.Sitemap = Array.from(publicNeighborhoodIds).map((id) => ({
      url: `${BASE_URL}/${getCitySlugFromId(id)}/${getNeighborhoodSlugFromId(id)}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }));

    // Most recent 1000 published articles (Supabase caps a single select at
    // 1000 rows; recency-first keeps the freshest content discoverable).
    // Articles for region='test' neighborhoods (Irish county syndication) are
    // filtered out post-fetch since their parent neighborhood pages aren't
    // public - leaving them in the sitemap caused Google to flag 404s and
    // burned 20% of the 1000-row cap on admin-only content.
    const { data: articles } = await supabase
      .from('articles')
      .select('id, slug, neighborhood_id, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1000);

    const articlePages: MetadataRoute.Sitemap = (articles || [])
      .filter((a) => a.neighborhood_id && publicNeighborhoodIds.has(a.neighborhood_id))
      .map((a) => ({
        url: `${BASE_URL}/${getCitySlugFromId(a.neighborhood_id)}/${getNeighborhoodSlugFromId(a.neighborhood_id)}/${a.slug || a.id}`,
        lastModified: a.published_at ? new Date(a.published_at) : now,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }));

    return [...staticPages, ...neighborhoodPages, ...articlePages];
  } catch (err) {
    console.error('[sitemap] failed to build dynamic entries:', err);
    return staticPages;
  }
}
