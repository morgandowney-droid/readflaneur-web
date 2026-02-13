'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Article } from '@/types';
import { formatRelativeTime, cityToSlug, neighborhoodToSlug, categoryLabelToSlug, cleanArticleHeadline, truncateHeadline } from '@/lib/utils';
import { useLanguageContext } from '@/components/providers/LanguageProvider';

const ARTICLE_BOOKMARKS_KEY = 'flaneur-article-bookmarks';

interface ArticleCardProps {
  article: Article;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const { language, isTranslated } = useLanguageContext();
  const [translatedHeadline, setTranslatedHeadline] = useState<string | null>(null);

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

  // Fetch translated headline when language changes
  useEffect(() => {
    if (!isTranslated) {
      setTranslatedHeadline(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/translations/article?id=${article.id}&lang=${language}`)
      .then(res => { if (!res.ok) throw new Error('not found'); return res.json(); })
      .then(data => { if (!cancelled) setTranslatedHeadline(data.headline || null); })
      .catch(() => { /* Silently fall back to English */ });
    return () => { cancelled = true; };
  }, [article.id, language, isTranslated]);

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
      <article
        className="bg-surface overflow-hidden transition-all cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Mobile: metadata + headline above image */}
        {!isHovered && (
          <div className="md:hidden px-4 pt-3 pb-2">
            <div className="flex items-center gap-2 text-xs text-fg-muted mb-1">
              <span className="uppercase tracking-wider">
                {article.neighborhood?.name}
              </span>
              <span>&middot;</span>
              <span>{formatRelativeTime(article.created_at)}</span>
              {article.category_label && (
                <>
                  <span>&middot;</span>
                  <span className="text-fg-muted italic">
                    {article.category_label}
                  </span>
                </>
              )}
            </div>
            <h2 className="text-fg text-xl font-semibold leading-tight">
              {truncateHeadline(translatedHeadline || cleanArticleHeadline(article.headline))}
            </h2>
          </div>
        )}

        <div className="relative aspect-video w-full bg-elevated">
          {article.image_url ? (
            <Image
              src={article.image_url}
              alt={article.headline}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 800px"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-12 h-12 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
          )}
          {/* Desktop: overlay on image (hidden on mobile since text is above) */}
          {!isHovered && (
            <div className="hidden md:block absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          )}
          {!isHovered && (
            <div className="hidden md:block absolute bottom-0 left-0 right-0 p-4">
              <div className="flex items-center gap-2 text-xs text-white/70 mb-1">
                <span className="uppercase tracking-wider">
                  {article.neighborhood?.name}
                </span>
                <span>&middot;</span>
                <span>{formatRelativeTime(article.created_at)}</span>
                {article.category_label && (
                  <>
                    <span>&middot;</span>
                    <span className="text-white/50 italic">
                      {article.category_label}
                    </span>
                  </>
                )}
              </div>
              <h2 className="text-white text-xl font-semibold leading-tight whitespace-nowrap overflow-hidden">
                {translatedHeadline || cleanArticleHeadline(article.headline)}
              </h2>
            </div>
          )}
          {/* AI badge for AI-generated content - right aligned to not cover headlines */}
          {(article.article_type === 'community_news' || article.article_type === 'brief_summary' || article.author_type === 'ai') && article.image_url && (
            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded" title="AI-generated illustration">
              AI
            </div>
          )}
          {/* Action buttons overlay */}
          <div className="absolute top-2 right-2 flex gap-1">
            <button
              onClick={handleShare}
              className="w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
              aria-label="Share"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
            <button
              onClick={handleBookmark}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                isBookmarked
                  ? 'bg-white text-black'
                  : 'bg-black/50 hover:bg-black/70 text-white'
              }`}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
            >
              <svg className="w-4 h-4" fill={isBookmarked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          </div>
        </div>

        {isHovered && (
          <div className="p-4">
            <div className="flex items-center gap-2 text-xs text-fg-muted mb-2">
              <span className="uppercase tracking-wider">
                {article.neighborhood?.name}
              </span>
              <span>&middot;</span>
              <span>{formatRelativeTime(article.created_at)}</span>
              {article.category_label && (
                <>
                  <span>&middot;</span>
                  <a
                    href={`/${citySlug}/${neighborhoodSlug}?category=${categoryLabelToSlug(article.category_label)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-fg-muted italic hover:text-fg-subtle hover:underline transition-colors"
                  >
                    {article.category_label}
                  </a>
                </>
              )}
            </div>
            <h2 className="text-xl md:text-2xl font-semibold mb-3 whitespace-nowrap overflow-hidden">{translatedHeadline || cleanArticleHeadline(article.headline)}</h2>
            <p className="text-fg-muted text-[1.05rem] leading-7 mb-4">
              {article.preview_text || article.body_text.substring(0, 200)}
            </p>
            <span className="text-sm font-bold tracking-wider uppercase text-amber-500 hover:text-amber-400">
              Read More
            </span>
          </div>
        )}
      </article>
    </Link>
  );
}
