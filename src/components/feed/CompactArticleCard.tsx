'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Article } from '@/types';
import { cityToSlug, neighborhoodToSlug, categoryLabelToSlug } from '@/lib/utils';

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
      <article className="flex gap-4 py-4 border-b border-white/[0.08] hover:bg-white/5 transition-colors">
        {article.image_url && (
          <div className="relative w-24 h-24 flex-shrink-0">
            <Image
              src={article.image_url}
              alt={article.headline}
              fill
              className="object-cover"
              sizes="96px"
            />
            {/* AI badge for AI-generated content */}
            {(article.article_type === 'community_news' || article.article_type === 'brief_summary' || article.author_type === 'ai') && (
              <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded" title="AI-generated illustration">
                AI
              </div>
            )}
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
            {article.category_label && (
              <>
                <span>&middot;</span>
                <span className="text-neutral-300 italic">
                  {article.category_label}
                </span>
              </>
            )}
          </div>
          <h2 className="font-semibold text-base leading-tight mb-1 line-clamp-2">
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
              className="text-xs text-neutral-400 hover:text-white transition-colors"
            >
              Share
            </button>
            <button
              onClick={handleBookmark}
              className={`text-xs transition-colors ${
                isBookmarked ? 'text-white' : 'text-neutral-400 hover:text-white'
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
