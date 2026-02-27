'use client';

import { useState, useEffect } from 'react';
import { useLanguageContext } from '@/components/providers/LanguageProvider';
import { ArticleBody } from './ArticleBody';

interface TranslatedHeadlineProps {
  articleId: string;
  headline: string;
  className?: string;
}

/** Renders translated headline when language !== 'en', else original. */
export function TranslatedHeadline({ articleId, headline, className }: TranslatedHeadlineProps) {
  const { language, isTranslated } = useLanguageContext();
  const [translatedHeadline, setTranslatedHeadline] = useState<string | null>(null);

  useEffect(() => {
    if (!isTranslated) {
      setTranslatedHeadline(null);
      return;
    }

    // Clear stale translation from previous language before fetching new one
    setTranslatedHeadline(null);

    let cancelled = false;
    fetch(`/api/translations/article?id=${articleId}&lang=${language}`)
      .then(res => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(data => {
        if (!cancelled) setTranslatedHeadline(data.headline);
      })
      .catch(() => {
        // Fall back to English - state already cleared above
      });

    return () => { cancelled = true; };
  }, [articleId, language, isTranslated]);

  return <span className={className}>{translatedHeadline || headline}</span>;
}

interface TranslatedArticleBodyProps {
  articleId: string;
  content: string;
  neighborhoodName: string;
  city: string;
  articleType?: string;
  country?: string;
}

/** Wraps ArticleBody with translation support.
 *  Fetches translated body when language !== 'en'.
 *  Falls back to English on miss. */
export function TranslatedArticleBody({
  articleId,
  content,
  neighborhoodName,
  city,
  articleType,
  country,
}: TranslatedArticleBodyProps) {
  const { language, isTranslated } = useLanguageContext();
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isTranslated) {
      setTranslatedContent(null);
      return;
    }

    // Clear stale translation from previous language before fetching new one
    setTranslatedContent(null);

    let cancelled = false;
    setLoading(true);

    fetch(`/api/translations/article?id=${articleId}&lang=${language}`)
      .then(res => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(data => {
        if (!cancelled) {
          setTranslatedContent(data.body);
        }
      })
      .catch(() => {
        // Fall back to English - state already cleared above
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [articleId, language, isTranslated]);

  if (loading) {
    return (
      <div className="max-w-none animate-pulse space-y-6" style={{ fontFamily: 'var(--font-body-serif)' }}>
        <div className="h-5 bg-elevated rounded w-full" />
        <div className="h-5 bg-elevated rounded w-5/6" />
        <div className="h-5 bg-elevated rounded w-full" />
        <div className="h-5 bg-elevated rounded w-4/6" />
        <div className="h-5 bg-elevated rounded w-full" />
        <div className="h-5 bg-elevated rounded w-3/4" />
      </div>
    );
  }

  return (
    <ArticleBody
      content={translatedContent || content}
      neighborhoodName={neighborhoodName}
      city={city}
      articleType={articleType}
      country={country}
    />
  );
}
