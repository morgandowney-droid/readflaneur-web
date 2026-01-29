import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatRelativeTime } from '@/lib/utils';
import { StoryOpenAd } from '@/components/feed/StoryOpenAd';
import { FallbackAd } from '@/components/feed/FallbackAd';
import { ArticleViewTracker } from '@/components/tracking/ArticleViewTracker';
import { Comments } from '@/components/comments/Comments';
import { Ad } from '@/types';

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

  const { data: article } = await supabase
    .from('articles')
    .select('headline, body_text')
    .or(`slug.eq.${slug},id.eq.${slug}`)
    .single();

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
  const cityPrefixMap: Record<string, string> = {
    'new-york': 'nyc',
    'san-francisco': 'sf',
    'london': 'london',
    'sydney': 'sydney',
    'stockholm': 'stockholm',
  };

  const prefix = cityPrefixMap[city] || city;
  const neighborhoodId = `${prefix}-${neighborhood}`;

  // Fetch the article
  const { data: article } = await supabase
    .from('articles')
    .select(`
      *,
      neighborhood:neighborhoods(*),
      author:profiles(full_name, avatar_url)
    `)
    .or(`slug.eq.${slug},id.eq.${slug}`)
    .single();

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
        <div className="relative aspect-video w-full mb-8">
          <Image
            src={article.image_url}
            alt={article.headline}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 800px"
            priority
          />
        </div>

        {/* Article Body */}
        <article className="prose prose-neutral max-w-none">
          {article.body_text.split('\n\n').map((paragraph: string, index: number) => (
            <p key={index} className="text-neutral-700 leading-relaxed mb-6">
              {paragraph}
            </p>
          ))}
        </article>

        {/* Additional Images */}
        {article.images && article.images.length > 1 && (
          <div className="mt-8 space-y-6">
            {article.images.slice(1).map((imageUrl: string, index: number) => (
              <div key={index} className="relative aspect-video w-full">
                <Image
                  src={imageUrl}
                  alt={`${article.headline} - Photo ${index + 2}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 800px"
                />
              </div>
            ))}
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
