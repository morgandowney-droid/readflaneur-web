import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatRelativeTime, categoryLabelToSlug } from '@/lib/utils';
import { StoryOpenAd } from '@/components/feed/StoryOpenAd';
import { FallbackAd } from '@/components/feed/FallbackAd';
import { ArticleViewTracker } from '@/components/tracking/ArticleViewTracker';
import { Comments } from '@/components/comments/Comments';
import { ArticleBody } from '@/components/article/ArticleBody';
import { AIImageDisclaimer, AIImageBadge } from '@/components/article/AIImageDisclaimer';
import { SourceAttribution } from '@/components/article/SourceAttribution';
import { Ad } from '@/types';
import { buildNeighborhoodId } from '@/lib/neighborhood-utils';

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

  const neighborhoodUrl = `/${city}/${neighborhood}`;

  return (
    <div className="py-8 px-4">
      {/* Track article view */}
      <ArticleViewTracker articleId={article.id} />

      <div className="mx-auto max-w-2xl">
        {/* Back link */}
        <Link
          href={neighborhoodUrl}
          className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-neutral-400 hover:text-black mb-8"
        >
          <span>&larr;</span>
          <span>{article.neighborhood?.name || 'Back'}</span>
        </Link>

        {/* Top Story Open Ad */}
        <div className="mb-8">
          {topAd ? (
            <StoryOpenAd ad={topAd} position="top" />
          ) : (
            <FallbackAd variant="story_open" position="top" />
          )}
        </div>

        {/* Article Header */}
        <header className="mb-8">
          <div className="flex items-center gap-2 text-xs text-neutral-400 mb-4">
            <span className="uppercase tracking-wider">
              {article.neighborhood?.name}
            </span>
            <span>&middot;</span>
            <span>{formatRelativeTime(article.created_at)}</span>
            {article.category_label && (
              <>
                <span>&middot;</span>
                <Link
                  href={`/${city}/${neighborhood}?category=${categoryLabelToSlug(article.category_label)}`}
                  className="text-neutral-300 italic hover:text-neutral-500 hover:underline transition-colors"
                >
                  {article.category_label}
                </Link>
              </>
            )}
            {(article.article_type === 'community_news' || article.article_type === 'brief_summary' || article.author_type === 'ai') && (
              <>
                <span>&middot;</span>
                <span className="text-neutral-300">AI-Synthesized Brief</span>
              </>
            )}
          </div>
          <h1 className="text-3xl font-light leading-tight mb-6">
            {article.headline}
          </h1>
          {article.author?.full_name && (
            <p className="text-sm text-neutral-500">
              By {article.author.full_name}
            </p>
          )}
        </header>

        {/* Featured Image */}
        {(() => {
          const isAIGenerated = article.article_type === 'community_news' ||
                                article.article_type === 'brief_summary' ||
                                article.author_type === 'ai';
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
            </>
          );
        })()}

        {/* Article Body */}
        <ArticleBody
          content={article.body_text}
          neighborhoodName={article.neighborhood?.name || ''}
          city={article.neighborhood?.city || ''}
        />

        {/* Source Attribution for AI-generated content */}
        <SourceAttribution
          sources={article.sources}
          isAIGenerated={
            article.article_type === 'community_news' ||
            article.article_type === 'brief_summary' ||
            article.author_type === 'ai'
          }
        />

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
        <div className="mt-12 pt-8 border-t border-neutral-200">
          {bottomAd ? (
            <StoryOpenAd ad={bottomAd} position="bottom" />
          ) : (
            <FallbackAd variant="story_open" position="bottom" />
          )}
        </div>

        {/* Comments Section */}
        <Comments articleId={article.id} />

        {/* More from neighborhood */}
        <div className="mt-12 pt-8 border-t border-neutral-200 text-center">
          <Link
            href={neighborhoodUrl}
            className="inline-block bg-black text-white px-8 py-3 text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors"
          >
            More from {article.neighborhood?.name}
          </Link>
        </div>
      </div>
    </div>
  );
}
