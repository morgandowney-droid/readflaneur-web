import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import Image from 'next/image';
import { MagicLinkReminder } from '@/components/feed/MagicLinkReminder';

export const dynamic = 'force-dynamic';

interface FeedPageProps {
  searchParams: Promise<{ neighborhoods?: string }>;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const params = await searchParams;
  const neighborhoodIds = params.neighborhoods?.split(',').filter(Boolean) || [];

  const supabase = await createClient();

  // Fetch articles from selected neighborhoods
  let query = supabase
    .from('articles')
    .select(`
      id,
      headline,
      preview_text,
      image_url,
      slug,
      published_at,
      neighborhood_id,
      neighborhoods (
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

        {articles && articles.length > 0 ? (
          <div className="space-y-6">
            {articles.map((article: any) => {
              const hood = article.neighborhoods;

              // Derive URL slugs from neighborhood_id (e.g., "nyc-west-village")
              let articleUrl = '#';
              if (article.neighborhood_id) {
                const parts = article.neighborhood_id.split('-');
                const prefix = parts[0];
                const neighborhoodSlug = parts.slice(1).join('-');
                const citySlugMap: Record<string, string> = {
                  'nyc': 'new-york',
                  'london': 'london',
                  'sf': 'san-francisco',
                  'stockholm': 'stockholm',
                  'sydney': 'sydney',
                };
                const citySlug = citySlugMap[prefix] || prefix;
                // Use slug if available, otherwise fallback to article ID
                const articleSlug = article.slug || article.id;
                articleUrl = `/${citySlug}/${neighborhoodSlug}/${articleSlug}`;
              }

              return (
                <Link key={article.id} href={articleUrl}>
                  <article className="flex gap-4 py-4 border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                    {article.image_url && (
                      <div className="relative w-24 h-24 flex-shrink-0">
                        <Image
                          src={article.image_url}
                          alt={article.headline}
                          fill
                          className="object-cover"
                          sizes="96px"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
                        <span className="uppercase tracking-wider">{hood?.name}</span>
                        {article.published_at && (
                          <>
                            <span>&middot;</span>
                            <span>{formatDate(article.published_at)}</span>
                          </>
                        )}
                      </div>
                      <h2 className="font-semibold text-sm leading-tight mb-1 line-clamp-2">
                        {article.headline}
                      </h2>
                      {article.preview_text && (
                        <p className="text-xs text-neutral-500 line-clamp-2">
                          {article.preview_text}
                        </p>
                      )}
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
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
