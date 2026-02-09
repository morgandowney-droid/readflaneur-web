import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { MagicLinkReminder } from '@/components/feed/MagicLinkReminder';
import { NeighborhoodFeed } from '@/components/feed/NeighborhoodFeed';
import { NeighborhoodBrief, BriefArchive } from '@/components/feed/NeighborhoodBrief';
import { MultiFeed } from '@/components/feed/MultiFeed';
import { LoadMoreButton } from '@/components/feed/LoadMoreButton';
import { MultiLoadMoreButton } from '@/components/feed/MultiLoadMoreButton';
import { FeedItem, Article, Ad } from '@/types';
import { injectAds } from '@/lib/ad-engine';

export const dynamic = 'force-dynamic';

const INITIAL_PAGE_SIZE = 10;

interface FeedPageProps {
  searchParams: Promise<{ neighborhoods?: string; section?: string }>;
}

// Map neighborhood prefix to city slug for URLs
const prefixToCitySlug: Record<string, string> = {
  'nyc': 'new-york',
  'sf': 'san-francisco',
  'london': 'london',
  'sydney': 'sydney',
  'stockholm': 'stockholm',
};

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const params = await searchParams;
  const neighborhoodIds = params.neighborhoods?.split(',').filter(Boolean) || [];
  const sectionSlug = params.section;

  const supabase = await createClient();

  // If section filter is specified, get section info and article IDs
  let sectionFilter: { id: string; name: string; icon?: string } | null = null;
  let sectionArticleIds: string[] | null = null;

  if (sectionSlug) {
    // Get section info
    const { data: sectionData } = await supabase
      .from('sections')
      .select('id, name, icon')
      .eq('slug', sectionSlug)
      .eq('is_active', true)
      .single();

    if (sectionData) {
      sectionFilter = sectionData;

      // Get article IDs that belong to this section
      const { data: articleSections } = await supabase
        .from('article_sections')
        .select('article_id')
        .eq('section_id', sectionData.id);

      sectionArticleIds = articleSections?.map(as => as.article_id) || [];
    }
  }

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
    .limit(INITIAL_PAGE_SIZE);

  if (neighborhoodIds.length > 0) {
    query = query.in('neighborhood_id', neighborhoodIds);
  }

  // Apply section filter if specified
  if (sectionArticleIds !== null) {
    if (sectionArticleIds.length === 0) {
      // No articles in this section, return empty
      query = query.in('id', ['00000000-0000-0000-0000-000000000000']); // Force empty result
    } else {
      query = query.in('id', sectionArticleIds);
    }
  }

  const { data: articles } = await query;

  // Count total articles for pagination
  let countQuery = supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published');

  if (neighborhoodIds.length > 0) {
    countQuery = countQuery.in('neighborhood_id', neighborhoodIds);
  }

  // Apply section filter to count query
  if (sectionArticleIds !== null) {
    if (sectionArticleIds.length === 0) {
      countQuery = countQuery.in('id', ['00000000-0000-0000-0000-000000000000']);
    } else {
      countQuery = countQuery.in('id', sectionArticleIds);
    }
  }

  const { count: totalCount } = await countQuery;
  const hasMoreArticles = (totalCount || 0) > INITIAL_PAGE_SIZE;

  // Get full neighborhood data for display (including combo info)
  const { data: neighborhoodsRaw } = await supabase
    .from('neighborhoods')
    .select('id, name, city, is_combo')
    .in('id', neighborhoodIds);

  // Fetch combo component names for combo neighborhoods
  const comboNeighborhoods = (neighborhoodsRaw || []).filter((n: any) => n.is_combo);
  const comboComponentNames: Record<string, string[]> = {};

  if (comboNeighborhoods.length > 0) {
    const { data: comboLinks } = await supabase
      .from('combo_neighborhoods')
      .select(`
        combo_id,
        display_order,
        component:neighborhoods!combo_neighborhoods_component_id_fkey (name)
      `)
      .in('combo_id', comboNeighborhoods.map((n: any) => n.id))
      .order('display_order');

    if (comboLinks) {
      comboLinks.forEach((link: any) => {
        if (!comboComponentNames[link.combo_id]) {
          comboComponentNames[link.combo_id] = [];
        }
        if (link.component?.name) {
          comboComponentNames[link.combo_id].push(link.component.name);
        }
      });
    }
  }

  // Add combo_component_names to neighborhoods
  const neighborhoodsWithCombo = (neighborhoodsRaw || []).map((n: any) => ({
    ...n,
    combo_component_names: comboComponentNames[n.id] || undefined,
  }));

  // Fetch ads (global or for selected neighborhoods)
  const { data: ads } = neighborhoodIds.length > 0
    ? await supabase
        .from('ads')
        .select('*')
        .or(`is_global.eq.true,neighborhood_id.in.(${neighborhoodIds.join(',')})`)
    : await supabase
        .from('ads')
        .select('*')
        .eq('is_global', true);

  // Transform articles to FeedItems with ads injected
  const feedItems: FeedItem[] = injectAds(
    (articles || []) as Article[],
    (ads || []) as Ad[],
    neighborhoodIds
  );

  // Helper to get city slug from neighborhood ID
  const getCitySlug = (neighborhoodId: string) => {
    const prefix = neighborhoodId.split('-')[0];
    return prefixToCitySlug[prefix] || prefix;
  };

  // Helper to get neighborhood slug from neighborhood ID
  const getNeighborhoodSlug = (neighborhoodId: string) => {
    const parts = neighborhoodId.split('-');
    return parts.slice(1).join('-');
  };

  // Single neighborhood selected - show full header
  const singleNeighborhood = neighborhoodIds.length === 1 && neighborhoodsWithCombo?.[0];

  // Multiple neighborhoods - show combined header
  const multipleNeighborhoods = neighborhoodIds.length > 1 && neighborhoodsWithCombo;

  // Fetch the latest neighborhood brief for single neighborhood
  let brief = null;
  if (singleNeighborhood) {
    const now = new Date().toISOString();
    const { data: briefData } = await supabase
      .from('neighborhood_briefs')
      .select('id, headline, content, generated_at, sources, enriched_content, enriched_categories, enriched_at')
      .eq('neighborhood_id', singleNeighborhood.id)
      .gt('expires_at', now)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();
    brief = briefData;
  }

  return (
    <div className="bg-canvas">
      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* Section filter indicator */}
        {sectionFilter && (
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {sectionFilter.icon && <span className="text-xl">{sectionFilter.icon}</span>}
              <h2 className="text-lg font-light tracking-wide">{sectionFilter.name}</h2>
            </div>
            <Link
              href={neighborhoodIds.length > 0 ? `/feed?neighborhoods=${neighborhoodIds.join(',')}` : '/feed'}
              className="text-xs tracking-widest uppercase text-neutral-400 hover:text-white transition-colors"
            >
              Clear Filter
            </Link>
          </div>
        )}

        {singleNeighborhood ? (
          <>
            {/* What's Happening brief */}
            {brief && (
              <NeighborhoodBrief
                headline={brief.headline}
                content={brief.content}
                generatedAt={brief.generated_at}
                neighborhoodName={singleNeighborhood.name}
                neighborhoodId={singleNeighborhood.id}
                city={singleNeighborhood.city}
                sources={brief.sources || []}
                enrichedContent={brief.enriched_content || undefined}
                enrichedCategories={brief.enriched_categories || undefined}
                enrichedAt={brief.enriched_at || undefined}
              />
            )}

            {/* Brief Archive */}
            <BriefArchive
              neighborhoodId={singleNeighborhood.id}
              neighborhoodName={singleNeighborhood.name}
              city={singleNeighborhood.city}
              currentBriefId={brief?.id}
            />

            <NeighborhoodFeed
              items={feedItems}
              city={singleNeighborhood.city}
              citySlug={getCitySlug(singleNeighborhood.id)}
              neighborhoodName={singleNeighborhood.name}
              neighborhoodSlug={getNeighborhoodSlug(singleNeighborhood.id)}
              neighborhoodId={singleNeighborhood.id}
              defaultView="compact"
            />
            {hasMoreArticles && (
              <LoadMoreButton
                neighborhoodId={singleNeighborhood.id}
                initialOffset={INITIAL_PAGE_SIZE}
                pageSize={INITIAL_PAGE_SIZE}
                sectionSlug={sectionSlug}
              />
            )}
            {feedItems.length === 0 && (
              <div className="text-center py-12">
                <p className="text-neutral-500 mb-4">No articles yet for this neighborhood.</p>
                <Link href="/neighborhoods" className="text-sm underline hover:no-underline">
                  Explore all neighborhoods
                </Link>
              </div>
            )}
          </>
        ) : (
          <>
            <MultiFeed
              items={feedItems}
              neighborhoods={neighborhoodsWithCombo || []}
              defaultView="compact"
              reminder={<MagicLinkReminder />}
            />
            {hasMoreArticles && neighborhoodIds.length > 0 && (
              <MultiLoadMoreButton
                neighborhoodIds={neighborhoodIds}
                initialOffset={INITIAL_PAGE_SIZE}
                pageSize={INITIAL_PAGE_SIZE}
                sectionSlug={sectionSlug}
              />
            )}
            {feedItems.length === 0 && (
              <div className="text-center py-12">
                <p className="text-neutral-500 mb-4">No articles yet for your selected neighborhoods.</p>
                <Link href="/neighborhoods" className="text-sm underline hover:no-underline">
                  Explore all neighborhoods
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
