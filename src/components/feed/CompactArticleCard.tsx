'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Article } from '@/types';
import { cityToSlug, neighborhoodToSlug } from '@/lib/utils';

interface CompactArticleCardProps {
  article: Article;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function CompactArticleCard({ article }: CompactArticleCardProps) {
  const citySlug = article.neighborhood?.city
    ? cityToSlug(article.neighborhood.city)
    : 'unknown';
  const neighborhoodSlug = neighborhoodToSlug(article.neighborhood_id);
  const articleUrl = `/${citySlug}/${neighborhoodSlug}/${article.slug || article.id}`;

  return (
    <Link href={articleUrl}>
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
            <span className="uppercase tracking-wider">{article.neighborhood?.name}</span>
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
}
