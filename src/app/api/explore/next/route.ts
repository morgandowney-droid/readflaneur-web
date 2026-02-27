import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\n$/, '').replace(/\/$/, '')
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

interface Suggestion {
  neighborhoodName: string;
  city: string;
  headline: string;
  teaser: string;
  url: string;
}

interface ExploreResponse {
  sameCity: Suggestion | null;
  sameTheme: Suggestion | null;
  geoHop: Suggestion | null;
}

/** Haversine distance in km */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildArticleUrl(neighborhood: { id: string; city: string }, slug: string): string {
  const citySlug = neighborhood.city.toLowerCase().replace(/\s+/g, '-');
  const neighborhoodSlug = neighborhood.id.replace(/^[^-]+-/, '');
  return `${BASE_URL}/${citySlug}/${neighborhoodSlug}/${slug}?explore=true`;
}

function truncateTeaser(text: string, maxLen = 80): string {
  if (!text || text.length <= maxLen) return text || '';
  const cut = text.lastIndexOf(' ', maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen) + '...';
}

/** Map category keywords to themes */
function extractTheme(categoryLabel: string): string | null {
  const lower = categoryLabel.toLowerCase();
  if (/noise|nuisance|safety|crime|blotter/.test(lower)) return 'safety';
  if (/auction|heritage|archive/.test(lower)) return 'culture';
  if (/museum|gallery|art|exhibition/.test(lower)) return 'culture';
  if (/food|restaurant|dining|liquor/.test(lower)) return 'dining';
  if (/real estate|property|retail/.test(lower)) return 'real estate';
  if (/film|fashion/.test(lower)) return 'entertainment';
  if (/look ahead|event/.test(lower)) return 'events';
  return null;
}

/**
 * GET /api/explore/next?neighborhoodId=xxx&city=yyy&country=zzz&lat=N&lng=N&category=zzz
 *
 * Returns 3 contextual exploration suggestions:
 * 1. Same city, different neighborhood
 * 2. Same theme/category, any city
 * 3. Geographic hop (different country, nearby-ish)
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const neighborhoodId = params.get('neighborhoodId');
  const city = params.get('city');
  const country = params.get('country');
  const lat = parseFloat(params.get('lat') || '0');
  const lng = parseFloat(params.get('lng') || '0');
  const category = params.get('category') || '';

  if (!neighborhoodId || !city) {
    return NextResponse.json({ sameCity: null, sameTheme: null, geoHop: null });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const result: ExploreResponse = {
    sameCity: null,
    sameTheme: null,
    geoHop: null,
  };

  // Strategy 1: Same city, different neighborhood
  try {
    const { data: sameCityHoods } = await supabase
      .from('neighborhoods')
      .select('id, name, city, country')
      .eq('city', city)
      .eq('is_active', true)
      .neq('id', neighborhoodId)
      .limit(5);

    if (sameCityHoods && sameCityHoods.length > 0) {
      for (const hood of sameCityHoods) {
        const { data: articles } = await supabase
          .from('articles')
          .select('slug, headline, preview_text')
          .eq('neighborhood_id', hood.id)
          .eq('article_type', 'brief_summary')
          .eq('status', 'published')
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(1);

        if (articles && articles[0]) {
          result.sameCity = {
            neighborhoodName: hood.name,
            city: hood.city,
            headline: articles[0].headline || '',
            teaser: truncateTeaser(articles[0].preview_text || ''),
            url: buildArticleUrl(hood, articles[0].slug),
          };
          break;
        }
      }
    }
  } catch {}

  // Strategy 2: Same theme/category, different neighborhood
  try {
    const theme = extractTheme(category);
    if (theme) {
      const themeKeywords: Record<string, string> = {
        safety: '%safety%',
        culture: '%culture%',
        dining: '%dining%',
        'real estate': '%real estate%',
        entertainment: '%entertainment%',
        events: '%look ahead%',
      };
      const pattern = themeKeywords[theme] || `%${theme}%`;

      const { data: themeArticles } = await supabase
        .from('articles')
        .select('slug, headline, preview_text, neighborhood_id, neighborhood:neighborhoods(id, name, city, country)')
        .ilike('category_label', pattern)
        .eq('status', 'published')
        .neq('neighborhood_id', neighborhoodId)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(5);

      if (themeArticles && themeArticles.length > 0) {
        // Pick one that's not same city as sameCity suggestion
        for (const a of themeArticles) {
          const hood = a.neighborhood as unknown as { id: string; name: string; city: string; country: string } | null;
          if (!hood) continue;
          if (result.sameCity && hood.name === result.sameCity.neighborhoodName) continue;

          result.sameTheme = {
            neighborhoodName: hood.name,
            city: hood.city,
            headline: a.headline || '',
            teaser: truncateTeaser(a.preview_text || ''),
            url: buildArticleUrl(hood, a.slug),
          };
          break;
        }
      }
    }
  } catch {}

  // Strategy 3: Geographic hop (different country)
  try {
    if (lat && lng) {
      const { data: allHoods } = await supabase
        .from('neighborhoods')
        .select('id, name, city, country, latitude, longitude')
        .eq('is_active', true)
        .eq('is_combo', false)
        .neq('id', neighborhoodId)
        .neq('region', 'test')
        .limit(300);

      if (allHoods && allHoods.length > 0) {
        // Filter to different country, sort by distance
        const differentCountry = allHoods
          .filter(h => h.country !== country && h.latitude && h.longitude)
          .map(h => ({
            ...h,
            distance: haversine(lat, lng, h.latitude!, h.longitude!),
          }))
          .sort((a, b) => a.distance - b.distance);

        // Try first 10 nearest from different countries
        for (const hood of differentCountry.slice(0, 10)) {
          // Skip if already used
          if (result.sameCity?.neighborhoodName === hood.name) continue;
          if (result.sameTheme?.neighborhoodName === hood.name) continue;

          const { data: articles } = await supabase
            .from('articles')
            .select('slug, headline, preview_text')
            .eq('neighborhood_id', hood.id)
            .eq('article_type', 'brief_summary')
            .eq('status', 'published')
            .gte('created_at', sevenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(1);

          if (articles && articles[0]) {
            result.geoHop = {
              neighborhoodName: hood.name,
              city: hood.city,
              headline: articles[0].headline || '',
              teaser: truncateTeaser(articles[0].preview_text || ''),
              url: buildArticleUrl(hood, articles[0].slug),
            };
            break;
          }
        }
      }
    }
  } catch {}

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
    },
  });
}
