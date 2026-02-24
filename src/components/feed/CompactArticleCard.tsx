'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Article } from '@/types';
import { cityToSlug, neighborhoodToSlug, cleanArticleHeadline, truncateHeadline } from '@/lib/utils';
import { useLanguageContext } from '@/components/providers/LanguageProvider';
import { useTranslation } from '@/hooks/useTranslation';

interface CompactArticleCardProps {
  article: Article;
}

function formatDate(dateString: string, locale: string = 'en', timezone?: string) {
  const date = new Date(dateString);
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  if (timezone) opts.timeZone = timezone;
  return date.toLocaleDateString(locale, opts);
}

/** Detect filler/greeting sentences that shouldn't lead a blurb */
function isFillerSentence(s: string): boolean {
  const t = s.trim();
  return /^(good\s+morning|morning|hello|hey|greetings)/i.test(t)
    || /^here'?s\s+(the\s+)?(download|latest|lowdown|rundown|roundup|update|what'?s\s+happening|your\s+morning)/i.test(t)
    || /^(welcome\s+to|let'?s\s+dive|let'?s\s+get\s+into|ready\s+for)/i.test(t)
    || /^(it'?s\s+been\s+a\s+(busy|quiet|slow|big|wild)|what\s+a\s+(week|day|morning))/i.test(t)
    || /^(god\s+morgon|hej|bonjour|guten\s+morgen|buenos\s+d[ií]as|bom\s+dia|buongiorno|ciao)/i.test(t)
    || /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d/i.test(t);
}

/** Extract a clean blurb: skip greeting/filler sentences, truncate at sentence boundary */
function cleanBlurb(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  // Find first non-filler sentence
  const startIdx = sentences.findIndex(s => !isFillerSentence(s));
  if (startIdx < 0) return truncateAtSentence(text, 200);
  // Build blurb from non-filler sentences
  const useful = sentences.slice(startIdx).join(' ');
  return truncateAtSentence(useful, 200);
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

  const rawBlurb = article.preview_text || article.body_text || '';
  const blurb = rawBlurb ? cleanBlurb(rawBlurb) : '';

  // Translation support
  const { language, isTranslated } = useLanguageContext();
  const { t } = useTranslation();
  const [translatedHeadline, setTranslatedHeadline] = useState<string | null>(null);
  const [translatedBlurb, setTranslatedBlurb] = useState<string | null>(null);

  useEffect(() => {
    if (!isTranslated) {
      setTranslatedHeadline(null);
      setTranslatedBlurb(null);
      return;
    }

    // Clear stale translation from previous language before fetching new one
    setTranslatedHeadline(null);
    setTranslatedBlurb(null);

    let cancelled = false;
    fetch(`/api/translations/article?id=${article.id}&lang=${language}`)
      .then(res => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(data => {
        if (!cancelled) {
          setTranslatedHeadline(data.headline || null);
          setTranslatedBlurb(data.preview_text || null);
        }
      })
      .catch(() => {
        // Fall back to English - state already cleared above
      });

    return () => { cancelled = true; };
  }, [article.id, language, isTranslated]);

  const metadataRow = (
    <div className="flex items-center gap-2 text-xs text-fg-muted mb-1 overflow-hidden whitespace-nowrap">
      <span className="uppercase tracking-wider shrink-0">{article.neighborhood?.name}</span>
      {(article.published_at || article.created_at) && (
        <>
          <span className="shrink-0">&middot;</span>
          <span className="shrink-0">{formatDate(
            article.published_at || article.created_at!,
            language,
            article.neighborhood?.timezone
          )}</span>
        </>
      )}
      {article.category_label && (
        <>
          <span className="shrink-0">&middot;</span>
          <span className="text-fg-muted italic truncate max-w-[120px]">
            {(() => {
              const stripped = article.category_label.replace(new RegExp(`^${article.neighborhood?.name}\\s+`, 'i'), '');
              if (isTranslated && /daily brief/i.test(stripped)) return t('feed.dailyBrief');
              return stripped;
            })()}
          </span>
        </>
      )}
    </div>
  );

  const fullHeadline = translatedHeadline || cleanArticleHeadline(article.headline);

  const headlineDesktop = (
    <h2 className="font-semibold text-lg md:text-xl leading-tight mb-1.5 whitespace-nowrap overflow-hidden">
      {fullHeadline}
    </h2>
  );

  const headlineMobile = (
    <h2 className="font-semibold text-lg leading-tight mb-1.5">
      {truncateHeadline(fullHeadline)}
    </h2>
  );

  const imageEl = article.image_url ? (
    <div className="relative w-24 h-24 flex-shrink-0">
      <Image
        src={article.image_url}
        alt={article.headline}
        fill
        className="object-cover"
        sizes="96px"
      />
      {(article.article_type === 'community_news' || article.article_type === 'brief_summary' || article.author_type === 'ai') && article.image_url && !article.image_url.includes('unsplash.com') && (
        <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded" title="AI-generated illustration">
          AI
        </div>
      )}
    </div>
  ) : null;

  return (
    <Link href={articleUrl}>
      <article className="py-4 border-b border-border hover:bg-hover transition-colors">
        {/* Desktop: original row layout */}
        <div className="hidden md:flex gap-4">
          {imageEl}
          <div className="flex-1 min-w-0">
            {metadataRow}
            {headlineDesktop}
            {(translatedBlurb || blurb) && (
              <p className="text-[1.05rem] text-fg-muted leading-7">
                {translatedBlurb || blurb}
              </p>
            )}
          </div>
        </div>

        {/* Mobile: metadata + headline above, then image + blurb row */}
        <div className="md:hidden">
          {metadataRow}
          {headlineMobile}
          <div className="flex gap-4">
            {imageEl}
            {(translatedBlurb || blurb) && (
              <p className="flex-1 min-w-0 text-[1.05rem] text-fg-muted leading-7">
                {translatedBlurb || blurb}
              </p>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
