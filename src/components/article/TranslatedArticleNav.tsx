'use client';

import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';

interface NavLinkProps {
  citySlug?: string;
  neighborhoodSlug?: string;
}

export function BackToFeedLink({ citySlug, neighborhoodSlug }: NavLinkProps) {
  const { t } = useTranslation();
  const href = citySlug && neighborhoodSlug
    ? `/${citySlug}/${neighborhoodSlug}`
    : '/feed';
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-fg-muted hover:text-fg mb-8"
    >
      <span>&larr;</span>
      <span>{t('article.allStories')}</span>
    </Link>
  );
}

export function TranslatedDailyBriefLabel({ dayAbbr }: { dayAbbr: string }) {
  const { t } = useTranslation();
  return <>{dayAbbr} {t('feed.dailyBrief')}</>;
}

export function MoreStoriesButton({ citySlug, neighborhoodSlug }: NavLinkProps) {
  const { t } = useTranslation();
  const href = citySlug && neighborhoodSlug
    ? `/${citySlug}/${neighborhoodSlug}`
    : '/feed';
  return (
    <Link
      href={href}
      className="inline-block bg-white text-neutral-900 px-8 py-3 text-sm tracking-widest uppercase hover:bg-neutral-200 transition-colors"
    >
      {t('article.moreStories')}
    </Link>
  );
}
