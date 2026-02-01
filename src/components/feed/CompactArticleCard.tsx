'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Article } from '@/types';
import { cityToSlug, neighborhoodToSlug } from '@/lib/utils';

const ARTICLE_BOOKMARKS_KEY = 'flaneur-article-bookmarks';

interface CompactArticleCardProps {
  article: Article;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function CompactArticleCard({ article }: CompactArticleCardProps) {
  const [isBookmarked, setIsBookmarked] = useState(false);

  const citySlug = article.neighborhood?.city
    ? cityToSlug(article.neighborhood.city)
    : 'unknown';
  const neighborhoodSlug = neighborhoodToSlug(article.neighborhood_id);
  const articleUrl = `/${citySlug}/${neighborhoodSlug}/${article.slug || article.id}`;

  useEffect(() => {
    const stored = localStorage.getItem(ARTICLE_BOOKMARKS_KEY);
    if (stored) {
      try {
        const bookmarks = JSON.parse(stored) as string[];
        setIsBookmarked(bookmarks.includes(article.id));
      } catch {
        // Invalid stored data
      }
    }
  }, [article.id]);

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const shareData = {
      title: article.headline,
      text: article.preview_text || article.headline,
      url: window.location.origin + articleUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled or error
      }
    } else {
      await navigator.clipboard.writeText(window.location.origin + articleUrl);
      alert('Link copied to clipboard');
    }
  };

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const stored = localStorage.getItem(ARTICLE_BOOKMARKS_KEY);
    let bookmarks: string[] = [];
    if (stored) {
      try {
        bookmarks = JSON.parse(stored);
      } catch {
        // Invalid stored data
      }
    }

    if (isBookmarked) {
      bookmarks = bookmarks.filter(id => id !== article.id);
    } else {
      bookmarks.push(article.id);
    }

    localStorage.setItem(ARTICLE_BOOKMARKS_KEY, JSON.stringify(bookmarks));
    setIsBookmarked(!isBookmarked);
  };

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
          <h2 className="font-semibold text-sm leading-tight mb-1 whitespace-nowrap overflow-hidden">
            {article.headline}
          </h2>
          {article.preview_text && (
            <p className="text-xs text-neutral-500 line-clamp-2">
              {article.preview_text}
            </p>
          )}
          {/* Action buttons */}
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={handleShare}
              className="text-xs text-neutral-400 hover:text-black transition-colors"
            >
              Share
            </button>
            <button
              onClick={handleBookmark}
              className={`text-xs transition-colors ${
                isBookmarked ? 'text-black' : 'text-neutral-400 hover:text-black'
              }`}
            >
              {isBookmarked ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      </article>
    </Link>
  );
}
