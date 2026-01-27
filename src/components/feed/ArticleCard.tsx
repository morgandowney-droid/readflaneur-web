'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Article } from '@/types';
import { formatRelativeTime, cityToSlug, neighborhoodToSlug } from '@/lib/utils';

interface ArticleCardProps {
  article: Article;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const citySlug = article.neighborhood?.city
    ? cityToSlug(article.neighborhood.city)
    : 'unknown';
  const neighborhoodSlug = neighborhoodToSlug(article.neighborhood_id);
  const articleUrl = `/${citySlug}/${neighborhoodSlug}/${article.slug || article.id}`;

  return (
    <Link href={articleUrl}>
      <article
        className="bg-white overflow-hidden transition-all cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative aspect-video w-full">
          <Image
            src={article.image_url}
            alt={article.headline}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 800px"
          />
          {!isHovered && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          )}
          {!isHovered && (
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h2 className="text-white text-lg font-semibold leading-tight line-clamp-2">
                {article.headline}
              </h2>
            </div>
          )}
        </div>

        {isHovered && (
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-neutral-400 mb-2">
              <span className="uppercase tracking-wider">
                {article.neighborhood?.name}
              </span>
              <span>&middot;</span>
              <span>{formatRelativeTime(article.created_at)}</span>
            </div>
            <h2 className="text-lg font-semibold mb-3">{article.headline}</h2>
            <p className="text-neutral-600 text-sm leading-relaxed mb-4">
              {article.preview_text || article.body_text.substring(0, 200)}
            </p>
            <span className="text-xs tracking-widest uppercase hover:underline">
              Read More
            </span>
          </div>
        )}
      </article>
    </Link>
  );
}
