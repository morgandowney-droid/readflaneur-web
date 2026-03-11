import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { SharedListClient } from './SharedListClient';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ shareToken: string }>;
}

interface NeighborhoodJoin {
  id: string;
  name: string;
  city: string;
  country: string;
  region: string;
  latitude: number;
  longitude: number;
}

interface ListItemRow {
  neighborhood_id: string;
  sort_order: number;
  neighborhood: NeighborhoodJoin;
}

interface ListRow {
  id: string;
  name: string;
  slug: string;
  is_public: boolean;
  share_token: string;
  created_at: string;
  user: { full_name: string | null } | null;
  destination_list_items: ListItemRow[];
}

interface ImageRow {
  neighborhood_id: string;
  unsplash_photos: Record<string, { url: string; photographer: string; photographer_url: string }> | null;
}

async function fetchList(shareToken: string) {
  if (!shareToken || shareToken.length !== 8) return null;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: list, error } = await admin
    .from('destination_lists')
    .select(`
      id, name, slug, is_public, share_token, created_at,
      user:profiles!user_id (full_name),
      destination_list_items (
        neighborhood_id,
        sort_order,
        neighborhood:neighborhoods (id, name, city, country, region, latitude, longitude)
      )
    `)
    .eq('share_token', shareToken)
    .eq('is_public', true)
    .single();

  if (error || !list) return null;

  const typedList = list as unknown as ListRow;

  // Fetch images for all neighborhoods in the list
  const neighborhoodIds = typedList.destination_list_items.map(i => i.neighborhood_id);

  const { data: images } = await admin
    .from('image_library_status')
    .select('neighborhood_id, unsplash_photos')
    .in('neighborhood_id', neighborhoodIds);

  const imageRows: ImageRow[] = (images || []) as ImageRow[];
  const imageMap: Record<string, { url: string; photographer: string }> = {};
  for (const row of imageRows) {
    if (!row.unsplash_photos) continue;
    const categories = ['daily-brief-1', 'daily-brief-2', 'look-ahead-1', 'sunday-edition', 'rss-story'];
    for (const cat of categories) {
      const photo = row.unsplash_photos[cat];
      if (photo?.url) {
        imageMap[row.neighborhood_id] = {
          url: photo.url.includes('?') ? photo.url.replace(/&w=\d+/, '&w=800') : `${photo.url}&w=800&q=80&fm=webp`,
          photographer: photo.photographer || '',
        };
        break;
      }
    }
  }

  // Build ordered items
  const items = typedList.destination_list_items
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(item => ({
      id: item.neighborhood_id,
      name: item.neighborhood?.name || item.neighborhood_id,
      city: item.neighborhood?.city || '',
      country: item.neighborhood?.country || '',
      imageUrl: imageMap[item.neighborhood_id]?.url || null,
      photographer: imageMap[item.neighborhood_id]?.photographer || null,
    }));

  return {
    name: typedList.name,
    creatorName: typedList.user?.full_name || null,
    shareToken: typedList.share_token,
    createdAt: typedList.created_at,
    items,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shareToken } = await params;
  const list = await fetchList(shareToken);

  if (!list) {
    return { title: 'List Not Found - Flaneur' };
  }

  return {
    title: `${list.name} - Flaneur`,
    description: `A curated list of ${list.items.length} destinations on Flaneur.`,
    openGraph: {
      title: `${list.name} - Flaneur`,
      description: `A curated list of ${list.items.length} destinations on Flaneur.`,
    },
  };
}

export default async function SharedListPage({ params }: PageProps) {
  const { shareToken } = await params;
  const list = await fetchList(shareToken);

  if (!list) {
    notFound();
  }

  return <SharedListClient list={list} />;
}
