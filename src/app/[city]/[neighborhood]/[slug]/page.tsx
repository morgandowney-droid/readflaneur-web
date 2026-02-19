import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatRelativeTime, categoryLabelToSlug, cleanArticleHeadline, getDayAbbr, neighborhoodToSlug } from '@/lib/utils';
import { StoryOpenAd } from '@/components/feed/StoryOpenAd';
import { FallbackAd } from '@/components/feed/FallbackAd';
import { ArticleViewTracker } from '@/components/tracking/ArticleViewTracker';
import { ArticleReactions } from '@/components/article/ArticleReactions';
import { PostReadEmailCapture } from '@/components/article/PostReadEmailCapture';
import { TranslatedArticleBody, TranslatedHeadline } from '@/components/article/TranslatedArticleBody';
import { AIImageDisclaimer, AIImageBadge } from '@/components/article/AIImageDisclaimer';
import { SourceAttribution } from '@/components/article/SourceAttribution';
import { Ad } from '@/types';
import { buildNeighborhoodId } from '@/lib/neighborhood-utils';
import { getComboForComponent } from '@/lib/combo-utils';
import { getFallback } from '@/lib/FallbackService';
import type { FallbackData } from '@/components/feed/FallbackAd';
import { BackToFeedLink, MoreStoriesButton, TranslatedDailyBriefLabel } from '@/components/article/TranslatedArticleNav';
import { BriefDiscoveryFooter } from '@/components/article/BriefDiscoveryFooter';

interface ArticlePageProps {
  params: Promise<{
    city: string;
    neighborhood: string;
    slug: string;
  }>;
}

export async function generateMetadata({ params }: ArticlePageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  // Check if slug looks like a UUID
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

  let query = supabase
    .from('articles')
    .select('headline, body_text');

  if (isUUID) {
    query = query.or(`slug.eq.${slug},id.eq.${slug}`);
  } else {
    query = query.eq('slug', slug);
  }

  const { data: article } = await query.single();

  if (!article) {
    return { title: 'Article | Flâneur' };
  }

  return {
    title: `${article.headline} | Flâneur`,
    description: article.body_text.substring(0, 160),
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { city, neighborhood, slug } = await params;
  const supabase = await createClient();

  // Map city slug to neighborhood prefix
  const neighborhoodId = buildNeighborhoodId(city, neighborhood);

  // Check if slug looks like a UUID (for backwards compatibility with old URLs)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

  // Fetch the article - query by slug, or by id if it's a UUID
  let articleQuery = supabase
    .from('articles')
    .select(`
      *,
      neighborhood:neighborhoods(*),
      author:profiles(full_name, avatar_url),
      sources:article_sources(*)
    `);

  if (isUUID) {
    articleQuery = articleQuery.or(`slug.eq.${slug},id.eq.${slug}`);
  } else {
    articleQuery = articleQuery.eq('slug', slug);
  }

  const { data: article } = await articleQuery.single();

  if (!article) {
    notFound();
  }

  // Check if this article's neighborhood is a component of a combo neighborhood
  const parentCombo = !article.neighborhood?.is_combo
    ? await getComboForComponent(supabase, article.neighborhood_id)
    : null;

  // Fetch story open ads (global or for this neighborhood)
  const { data: storyOpenAds } = await supabase
    .from('ads')
    .select('*')
    .eq('status', 'active')
    .eq('placement', 'story_open')
    .or(`is_global.eq.true,neighborhood_id.eq.${neighborhoodId}`);

  // Get up to 2 ads for top and bottom
  const ads = (storyOpenAds || []) as Ad[];
  const topAd = ads[0] || null;
  const bottomAd = ads[1] || ads[0] || null; // Reuse first ad if only one available

  // Session check (instant — reads cookies, no network call)
  const { data: { session } } = await supabase.auth.getSession();
  const isAdmin = session?.user?.email === 'morgan.downey@gmail.com';

  // Resolve fallback when no paid ads exist
  let fallbackData: FallbackData | undefined;
  if (ads.length === 0) {
    fallbackData = await getFallback(supabase, neighborhoodId, {
      isAuthenticated: !!session?.user,
    });
  }

  // Look up Unsplash photo credit if image is from Unsplash
  let unsplashCredit: { photographer: string; photographer_url: string } | null = null;
  if (article.image_url?.includes('images.unsplash.com') && article.neighborhood_id) {
    const { data: libStatus } = await supabase
      .from('image_library_status')
      .select('unsplash_photos')
      .eq('neighborhood_id', article.neighborhood_id)
      .single();

    if (libStatus?.unsplash_photos) {
      const photos = libStatus.unsplash_photos as Record<string, { url: string; photographer: string; photographer_url: string }>;
      // Find the photo entry matching this article's image URL
      for (const photo of Object.values(photos)) {
        if (photo.url === article.image_url) {
          unsplashCredit = { photographer: photo.photographer, photographer_url: photo.photographer_url };
          break;
        }
      }
      // If no exact match (URL params may differ), use first photo's credit as fallback
      if (!unsplashCredit) {
        const firstPhoto = Object.values(photos)[0];
        if (firstPhoto) {
          unsplashCredit = { photographer: firstPhoto.photographer, photographer_url: firstPhoto.photographer_url };
        }
      }
    }
  }

  // Fetch nearby neighborhoods in the same city for exploration
  const { data: nearbyNeighborhoods } = await supabase
    .from('neighborhoods')
    .select('id, name')
    .eq('city', article.neighborhood?.city || '')
    .eq('is_active', true)
    .neq('id', neighborhoodId)
    .limit(5);

  const neighborhoodUrl = `/${city}/${neighborhood}`;

  return (
    <div className="py-8 px-4">
      {/* Track article view */}
      <ArticleViewTracker articleId={article.id} />

      <div className="mx-auto max-w-2xl">
        {/* Back link - goes to main feed (user's neighborhoods loaded from localStorage) */}
        <BackToFeedLink />

        {/* Top Story Open Ad */}
        <div className="mb-8">
          {topAd ? (
            <StoryOpenAd ad={topAd} position="top" />
          ) : (
            <FallbackAd variant="story_open" position="top" fallback={fallbackData} />
          )}
        </div>

        {/* Article Header */}
        <header className="mb-8">
          {(() => {
            const isBrief = article.article_type === 'brief_summary' ||
              (article.category_label && article.category_label.toLowerCase().includes('daily brief'));

            if (isBrief) {
              return (
                <>
                  <p className="text-xs uppercase tracking-wider text-fg-muted mb-1">
                    {article.neighborhood?.name}
                    {article.neighborhood?.city && <span> &middot; {article.neighborhood.city}</span>}
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-3">
                    <TranslatedDailyBriefLabel dayAbbr={getDayAbbr(article.published_at || article.created_at)} />
                  </p>
                  <h1 className="text-3xl font-light leading-tight mb-3">
                    <TranslatedHeadline articleId={article.id} headline={cleanArticleHeadline(article.headline)} />
                  </h1>
                  <p className="text-xs text-fg-muted">
                    {formatRelativeTime(article.created_at)}
                  </p>
                </>
              );
            }

            return (
              <>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted mb-4">
                  <Link
                    href={`/${city}/${neighborhood}`}
                    className="uppercase tracking-wider text-fg-muted hover:text-accent transition-colors"
                  >
                    {article.neighborhood?.name}
                  </Link>
                  {parentCombo && (
                    <>
                      <span className="text-fg-muted/40">&middot;</span>
                      <Link
                        href={`/${city}/${neighborhoodToSlug(parentCombo.comboId)}`}
                        className="uppercase tracking-wider text-amber-600/70 hover:text-amber-500 transition-colors"
                      >
                        {parentCombo.comboName}
                      </Link>
                    </>
                  )}
                  <span>&middot;</span>
                  <span>{formatRelativeTime(article.created_at)}</span>
                  {article.category_label && (
                    <>
                      <span>&middot;</span>
                      <Link
                        href={`/${city}/${neighborhood}?category=${categoryLabelToSlug(article.category_label)}`}
                        className="text-fg-muted italic hover:text-fg-subtle hover:underline transition-colors"
                      >
                        {article.category_label}
                      </Link>
                    </>
                  )}
                  {(article.article_type === 'community_news' || article.article_type === 'brief_summary' || article.author_type === 'ai') && (
                    <>
                      <span>&middot;</span>
                      <span className="text-fg-muted" title={isAdmin ? (article.enrichment_model || '') : ''}>AI-Synthesized Brief{isAdmin && article.enrichment_model ? ` · ${article.enrichment_model.replace('gemini-', '').replace('2.5-', '')}` : ''}</span>
                    </>
                  )}
                </div>
                <h1 className="text-3xl font-light leading-tight mb-6">
                  <TranslatedHeadline articleId={article.id} headline={article.headline} />
                </h1>
                {article.author?.full_name && (
                  <p className="text-sm text-fg-subtle">
                    By {article.author.full_name}
                  </p>
                )}
              </>
            );
          })()}
        </header>

        {/* Featured Image - only show if image exists */}
        {article.image_url && (() => {
          const isUnsplash = article.image_url.includes('images.unsplash.com');
          const isAIGenerated = !isUnsplash && (
            article.article_type === 'community_news' ||
            article.article_type === 'brief_summary' ||
            article.author_type === 'ai'
          );
          return (
            <>
              <div className="relative aspect-video w-full mb-2">
                <Image
                  src={article.image_url}
                  alt={article.headline}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 800px"
                  priority
                />
                {isAIGenerated && <AIImageBadge position="bottom-left" />}
              </div>
              {isAIGenerated && <AIImageDisclaimer className="mb-6" />}
              {isUnsplash && unsplashCredit && (
                <p className="text-xs text-fg-muted mb-6">
                  Photo by{' '}
                  <a href={`${unsplashCredit.photographer_url}?utm_source=flaneur&utm_medium=referral`} target="_blank" rel="noopener noreferrer" className="underline">
                    {unsplashCredit.photographer}
                  </a>
                  {' '}on{' '}
                  <a href="https://unsplash.com/?utm_source=flaneur&utm_medium=referral" target="_blank" rel="noopener noreferrer" className="underline">
                    Unsplash
                  </a>
                </p>
              )}
            </>
          );
        })()}

        {/* Article Body */}
        <TranslatedArticleBody
          articleId={article.id}
          content={article.body_text}
          neighborhoodName={article.neighborhood?.name || ''}
          city={article.neighborhood?.city || ''}
        />

        {/* Source Attribution for AI-generated content */}
        <SourceAttribution
          sources={article.sources}
          editorNotes={article.editor_notes}
          isAIGenerated={
            article.article_type === 'community_news' ||
            article.article_type === 'brief_summary' ||
            article.author_type === 'ai'
          }
          headline={article.headline}
          neighborhoodName={article.neighborhood?.name}
          category={article.category_label?.toLowerCase().includes('look ahead') ? 'look_ahead'
            : article.article_type === 'brief_summary' ? 'brief_summary'
            : article.category_label?.toLowerCase().includes('sunday edition') ? 'weekly_recap'
            : undefined}
          categoryLabel={article.category_label}
        />

        {/* Brief discovery CTAs - right after sources on daily brief and Sunday Edition articles */}
        {(article.article_type === 'brief_summary' ||
          (article.category_label && article.category_label.toLowerCase().includes('daily brief'))) && (
          <BriefDiscoveryFooter
            neighborhoodId={article.neighborhood_id || neighborhoodId}
            neighborhoodName={article.neighborhood?.name || ''}
            city={article.neighborhood?.city || ''}
            currentArticleSlug={article.slug || ''}
            citySlug={city}
            neighborhoodSlug={neighborhood}
            publishedAt={article.published_at || article.created_at}
          />
        )}
        {article.article_type === 'look_ahead' && (
          <BriefDiscoveryFooter
            neighborhoodId={article.neighborhood_id || neighborhoodId}
            neighborhoodName={article.neighborhood?.name || ''}
            city={article.neighborhood?.city || ''}
            currentArticleSlug={article.slug || ''}
            citySlug={city}
            neighborhoodSlug={neighborhood}
            publishedAt={article.published_at || article.created_at}
            variant="look_ahead"
          />
        )}
        {article.category_label === 'The Sunday Edition' && (
          <BriefDiscoveryFooter
            neighborhoodId={article.neighborhood_id || neighborhoodId}
            neighborhoodName={article.neighborhood?.name || ''}
            city={article.neighborhood?.city || ''}
            currentArticleSlug={article.slug || ''}
            citySlug={city}
            neighborhoodSlug={neighborhood}
            publishedAt={article.published_at || article.created_at}
            variant="sunday"
          />
        )}

        {/* Additional Images */}
        {article.images && article.images.length > 1 && (
          <div className="mt-8 space-y-6">
            {article.images.slice(1).map((imageUrl: string, index: number) => {
              const isAIGenerated = article.article_type === 'community_news' ||
                                    article.article_type === 'brief_summary' ||
                                    article.author_type === 'ai';
              return (
                <div key={index}>
                  <div className="relative aspect-video w-full">
                    <Image
                      src={imageUrl}
                      alt={`${article.headline} - Photo ${index + 2}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 800px"
                    />
                    {isAIGenerated && <AIImageBadge position="bottom-left" />}
                  </div>
                  {isAIGenerated && <AIImageDisclaimer className="mt-2" />}
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Story Open Ad */}
        <div className="mt-12 pt-8 border-t border-border">
          {bottomAd ? (
            <StoryOpenAd ad={bottomAd} position="bottom" />
          ) : (
            <FallbackAd
              variant="story_open"
              position="bottom"
              fallback={fallbackData}
              articleNeighborhoodId={neighborhoodId}
              articleNeighborhoodName={article.neighborhood?.name}
            />
          )}
        </div>

        {/* Reactions */}
        <ArticleReactions articleId={article.id} />

        {/* Email capture for engaged readers */}
        <PostReadEmailCapture neighborhoodName={article.neighborhood?.name || 'neighborhood'} />

        {/* More stories */}
        <div className="mt-12 pt-8 border-t border-border text-center">
          <MoreStoriesButton />
        </div>

        {/* Explore nearby neighborhoods */}
        {nearbyNeighborhoods && nearbyNeighborhoods.length > 0 && (
          <div className="mt-8 text-center">
            <p className="text-[10px] uppercase tracking-widest text-fg-muted mb-3">Explore nearby</p>
            <div className="flex flex-wrap justify-center gap-2">
              {nearbyNeighborhoods.map((n) => (
                <Link
                  key={n.id}
                  href={`/${city}/${neighborhoodToSlug(n.id)}`}
                  className="px-3 py-1.5 text-xs border border-border rounded-full text-fg-muted hover:border-border-strong hover:text-fg transition-colors"
                >
                  {n.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
