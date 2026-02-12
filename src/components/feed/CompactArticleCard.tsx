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

/** Truncate text at the last full sentence boundary within maxLen chars */
function truncateAtSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  // Find the last sentence-ending punctuation
  const lastPeriod = slice.lastIndexOf('.');
  const lastExcl = slice.lastIndexOf('!');
  const lastQuestion = slice.lastIndexOf('?');
  const lastEnd = Math.max(lastPeriod, lastExcl, lastQuestion);
  if (lastEnd > 0) {
    return text.slice(0, lastEnd + 1);
  }
  // No sentence boundary found - fall back to word boundary
  const lastSpace = slice.lastIndexOf(' ');
  return lastSpace > 0 ? text.slice(0, lastSpace) : slice;
}

export function CompactArticleCard({ article }: CompactArticleCardProps) {
  const citySlug = article.neighborhood?.city
    ? cityToSlug(article.neighborhood.city)
    : 'unknown';
  const neighborhoodSlug = neighborhoodToSlug(article.neighborhood_id);
  const articleUrl = `/${citySlug}/${neighborhoodSlug}/${article.slug || article.id}`;

  const blurb = article.preview_text ? truncateAtSentence(article.preview_text, 200) : '';

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
          <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1 overflow-hidden whitespace-nowrap">
            <span className="uppercase tracking-wider shrink-0">{article.neighborhood?.name}</span>
            {article.published_at && (
              <>
                <span className="shrink-0">&middot;</span>
                <span className="shrink-0">{formatDate(article.published_at)}</span>
              </>
            )}
            {article.category_label && (
              <>
                <span className="shrink-0">&middot;</span>
                <span className="text-neutral-300 italic truncate max-w-[120px]">
                  {article.category_label.replace(new RegExp(`^${article.neighborhood?.name}\\s+`, 'i'), '')}
                </span>
              </>
            )}
          </div>
          <h2 className="font-semibold text-lg md:text-xl leading-tight mb-1.5 whitespace-nowrap overflow-hidden">
            {article.headline}
          </h2>
          {blurb && (
            <p className="text-[1.05rem] text-neutral-400 leading-7">
              {blurb}
            </p>
          )}
        </div>
      </article>
    </Link>
  );
}
