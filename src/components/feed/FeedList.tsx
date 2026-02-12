'use client';

import { FeedItem, Article, Ad } from '@/types';
import { ArticleCard } from './ArticleCard';
import { CompactArticleCard } from './CompactArticleCard';
import { AdCard } from './AdCard';
import { EmailCaptureCard } from './EmailCaptureCard';
import { FeedView } from './ViewToggle';
import { useNewUserGracePeriod } from '@/hooks/useNewUserGracePeriod';

interface FeedListProps {
  items: FeedItem[];
  view?: FeedView;
}

export function FeedList({ items, view = 'gallery' }: FeedListProps) {
  const isGracePeriod = useNewUserGracePeriod();

  // Filter out ads and email prompts during new user grace period
  const displayItems = isGracePeriod
    ? items.filter(item => item.type === 'article')
    : items;

  if (displayItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        {/* Empty state icon */}
        <div className="w-16 h-16 mb-6 text-neutral-200">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
        </div>
        <p className="text-base font-medium text-neutral-200 mb-1">No stories yet</p>
        <p className="text-sm text-neutral-400 mb-6">We&apos;re gathering local news for this neighborhood.</p>
        <a
          href="/neighborhoods"
          className="text-xs tracking-widest uppercase text-neutral-500 hover:text-white transition-colors"
        >
          Explore other neighborhoods
        </a>
      </div>
    );
  }

  return (
    <div className={view === 'compact' ? 'space-y-0' : 'space-y-4'}>
      {displayItems.map((item, index) => {
        if (item.type === 'email-prompt') {
          return (
            <div key="email-prompt" className="py-4">
              <EmailCaptureCard
                neighborhoodName={(item.data as any).neighborhoodName}
              />
            </div>
          );
        }
        if (item.type === 'article') {
          return view === 'compact' ? (
            <CompactArticleCard
              key={`article-${item.data.id}-${index}`}
              article={item.data as Article}
            />
          ) : (
            <ArticleCard
              key={`article-${item.data.id}-${index}`}
              article={item.data as Article}
            />
          );
        }
        return (
          <div key={`ad-${item.data.id}-${index}`} className="py-6 border-t border-white/[0.08]">
            <AdCard
              ad={item.data as Ad}
              variant={view}
            />
          </div>
        );
      })}
    </div>
  );
}
