import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { MagicLinkReminder } from '@/components/feed/MagicLinkReminder';
import { FeedWithViewToggle } from '@/components/feed/FeedWithViewToggle';
import { FeedItem, Article } from '@/types';

export const dynamic = 'force-dynamic';

interface FeedPageProps {
  searchParams: Promise<{ neighborhoods?: string }>;
}

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const params = await searchParams;
  const neighborhoodIds = params.neighborhoods?.split(',').filter(Boolean) || [];

  const supabase = await createClient();

  // Fetch articles from selected neighborhoods
  let query = supabase
    .from('articles')
    .select(`
      *,
      neighborhood:neighborhoods (
        id,
        name,
        city
      )
    `)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(20);

  if (neighborhoodIds.length > 0) {
    query = query.in('neighborhood_id', neighborhoodIds);
  }

  const { data: articles } = await query;

  // Get neighborhood names for display
  const { data: neighborhoodsData } = await supabase
    .from('neighborhoods')
    .select('id, name')
    .in('id', neighborhoodIds);

  const neighborhoodNames = neighborhoodsData?.map(n => n.name) || [];

  // Transform articles to FeedItems
  const feedItems: FeedItem[] = (articles || []).map((article: Article) => ({
    type: 'article' as const,
    data: article,
  }));

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-light tracking-wide mb-2">Your Feed</h1>
          {neighborhoodNames.length > 0 && (
            <p className="text-sm text-neutral-500">
              Stories from {neighborhoodNames.join(', ')}
            </p>
          )}
          <MagicLinkReminder />
        </div>

        {feedItems.length > 0 ? (
          <FeedWithViewToggle items={feedItems} defaultView="compact" />
        ) : (
          <div className="text-center py-12">
            <p className="text-neutral-500 mb-4">No articles yet for your selected neighborhoods.</p>
            <Link
              href="/neighborhoods"
              className="text-sm underline hover:no-underline"
            >
              Explore all neighborhoods
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
