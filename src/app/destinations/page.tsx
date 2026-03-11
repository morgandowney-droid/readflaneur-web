import { createClient } from '@supabase/supabase-js';
import { DestinationsClient } from '@/components/destinations/DestinationsClient';

export const metadata = {
  title: 'Destinations - Flaneur',
  description: 'Explore 270+ neighborhoods across 91 cities worldwide.',
};

export const dynamic = 'force-dynamic';

interface NeighborhoodRow {
  id: string;
  name: string;
  city: string;
  country: string;
  region: string;
  latitude: number;
  longitude: number;
  is_combo: boolean;
  is_community: boolean;
}

interface ImageRow {
  neighborhood_id: string;
  unsplash_photos: Record<string, { url: string; photographer: string; photographer_url: string }> | null;
}

export default async function DestinationsPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch all active neighborhoods + their Unsplash photos in parallel
  const [neighbRes, imageRes] = await Promise.all([
    supabase
      .from('neighborhoods')
      .select('id, name, city, country, region, latitude, longitude, is_combo, is_community')
      .eq('is_active', true)
      .neq('community_status', 'removed')
      .neq('region', 'test')
      .order('name'),
    supabase
      .from('image_library_status')
      .select('neighborhood_id, unsplash_photos'),
  ]);

  const neighborhoods: NeighborhoodRow[] = neighbRes.data || [];
  const imageRows: ImageRow[] = imageRes.data || [];

  // Build a map of neighborhoodId -> first Unsplash photo URL
  const imageMap: Record<string, { url: string; photographer: string }> = {};
  for (const row of imageRows) {
    if (!row.unsplash_photos) continue;
    // Pick the first category photo available
    const categories = ['daily-brief-1', 'daily-brief-2', 'daily-brief-3', 'look-ahead-1', 'sunday-edition', 'rss-story'];
    for (const cat of categories) {
      const photo = row.unsplash_photos[cat];
      if (photo?.url) {
        // Use smaller size for card thumbnails
        imageMap[row.neighborhood_id] = {
          url: photo.url.includes('?') ? photo.url.replace(/&w=\d+/, '&w=600') : `${photo.url}&w=600&q=80&fm=webp`,
          photographer: photo.photographer || '',
        };
        break;
      }
    }
  }

  // Normalize country names
  const normalizeCountry = (c: string) => {
    if (c === 'United States') return 'USA';
    return c;
  };

  // Build destination data for client
  const destinations = neighborhoods.map(n => ({
    id: n.id,
    name: n.name,
    city: n.city,
    country: normalizeCountry(n.country),
    region: n.region,
    lat: n.latitude,
    lng: n.longitude,
    isCombo: n.is_combo,
    isCommunity: n.is_community,
    imageUrl: imageMap[n.id]?.url || null,
    photographer: imageMap[n.id]?.photographer || null,
  }));

  // Unique countries for filter
  const countries = [...new Set(neighborhoods.map(n => n.country))].sort();

  return <DestinationsClient destinations={destinations} countries={countries} />;
}
