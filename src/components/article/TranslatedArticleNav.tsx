'use client';

import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';

export function BackToFeedLink({ isExploring, trailCount }: { isExploring?: boolean; trailCount?: number } = {}) {
  const { t } = useTranslation();

  const label = isExploring && trailCount && trailCount > 1
    ? `Exploring (${trailCount} neighborhoods)`
    : isExploring
      ? (t('explore.keepExploring') || 'Keep Exploring')
      : t('article.allStories');

  return (
    <Link
      href="/feed"
      className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-fg-muted hover:text-fg mb-8"
    >
      <span>&larr;</span>
      <span>{label}</span>
    </Link>
  );
}

export function TranslatedDailyBriefLabel({ dayAbbr }: { dayAbbr: string }) {
  const { t } = useTranslation();
  return <>{dayAbbr} {t('feed.dailyBrief')}</>;
}

export function MoreStoriesButton() {
  const { t } = useTranslation();
  return (
    <Link
      href="/feed"
      className="inline-block bg-white text-neutral-900 px-8 py-3 text-sm tracking-widest uppercase hover:bg-neutral-200 transition-colors"
    >
      {t('article.moreStories')}
    </Link>
  );
}
