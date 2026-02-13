'use client';

import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';

export function BackToFeedLink() {
  const { t } = useTranslation();
  return (
    <Link
      href="/feed"
      className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-fg-muted hover:text-fg mb-8"
    >
      <span>&larr;</span>
      <span>{t('article.allStories')}</span>
    </Link>
  );
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
