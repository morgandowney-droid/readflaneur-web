'use client';

import Image from 'next/image';
import Link from 'next/link';
import { cleanArticleHeadline } from '@/lib/utils';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';

interface EditorialArticle {
  id: string;
  headline: string;
  preview_text?: string;
  image_url?: string;
  slug: string;
  neighborhood_id: string;
  article_type?: string;
  neighborhood?: {
    id: string;
    name: string;
    city: string;
    timezone?: string;
  };
}

interface EditorialGridProps {
  articles: EditorialArticle[];
}

export function EditorialGrid({ articles }: EditorialGridProps) {
  // Filter to articles with images for the grid
  const withImages = articles.filter(a => a.image_url);
  if (withImages.length < 2) return null;

  // Take up to 5 articles for the editorial grid
  const featured = withImages.slice(0, 5);
  const [primary, ...secondary] = featured;

  return (
    <section className="w-full max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">
      {/* Section label */}
      <p className="text-[11px] tracking-[0.3em] uppercase text-fg-subtle mb-6 md:mb-8">
        Today&apos;s Stories
      </p>

      {/* Asymmetric editorial grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 md:gap-5">
        {/* Primary feature - large left */}
        <EditorialCard
          article={primary}
          className="lg:col-span-7 aspect-[4/3] md:aspect-[16/10]"
          headlineSize="large"
        />

        {/* Secondary stack - right column */}
        <div className="lg:col-span-5 grid grid-cols-1 gap-4 md:gap-5">
          {secondary.slice(0, 2).map((article) => (
            <EditorialCard
              key={article.id}
              article={article}
              className="aspect-[16/9] md:aspect-[16/8]"
              headlineSize="medium"
            />
          ))}
        </div>

        {/* Bottom row - two equal cards */}
        {secondary.length > 2 && (
          <>
            {secondary.slice(2, 4).map((article) => (
              <EditorialCard
                key={article.id}
                article={article}
                className="lg:col-span-6 aspect-[16/9]"
                headlineSize="medium"
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function EditorialCard({
  article,
  className = '',
  headlineSize = 'medium',
}: {
  article: EditorialArticle;
  className?: string;
  headlineSize?: 'large' | 'medium';
}) {
  const citySlug = getCitySlugFromId(article.neighborhood_id);
  const neighborhoodSlug = getNeighborhoodSlugFromId(article.neighborhood_id);
  const href = `/${citySlug}/${neighborhoodSlug}/${article.slug}`;
  const headline = cleanArticleHeadline(article.headline);
  const neighborhoodName = article.neighborhood?.name || article.neighborhood_id;
  const city = article.neighborhood?.city || '';

  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-sm block ${className}`}
    >
      {/* Background image with hover zoom */}
      {article.image_url && (
        <Image
          src={article.image_url}
          alt={headline}
          fill
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          sizes={headlineSize === 'large' ? '(max-width: 768px) 100vw, 58vw' : '(max-width: 768px) 100vw, 42vw'}
        />
      )}

      {/* Gradient scrim - LC-inspired warm charcoal, starts early for short cards */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, transparent 10%, rgba(32,32,32,0.4) 50%, rgba(32,32,32,0.82) 100%)' }}
      />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-7">
        {/* Location label */}
        <p className="text-[10px] tracking-[0.25em] uppercase text-white/70 mb-1.5">
          {neighborhoodName} {city && <span className="text-white/40">&middot; {city}</span>}
        </p>

        {/* Headline */}
        <h3 className={`font-display text-white font-light leading-tight ${
          headlineSize === 'large'
            ? 'text-xl md:text-3xl lg:text-4xl max-w-lg'
            : 'text-lg md:text-xl lg:text-2xl max-w-md'
        }`}>
          {headline}
        </h3>

        {/* Blurb - only on large card */}
        {headlineSize === 'large' && article.preview_text && (
          <p className="hidden md:block text-sm text-white/70 mt-2 max-w-md line-clamp-2 font-light">
            {article.preview_text}
          </p>
        )}
      </div>
    </Link>
  );
}
