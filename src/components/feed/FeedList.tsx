'use client';

import { FeedItem, Article, Ad } from '@/types';
import { ArticleCard } from './ArticleCard';
import { CompactArticleCard } from './CompactArticleCard';
import { AdCard } from './AdCard';
import { FeedView } from './ViewToggle';

interface FeedListProps {
  items: FeedItem[];
  view?: FeedView;
}

export function FeedList({ items, view = 'gallery' }: FeedListProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium mb-2">No stories yet.</p>
        <p className="text-neutral-400">Check back soon for updates.</p>
      </div>
    );
  }

  return (
    <div className={view === 'compact' ? 'space-y-0' : 'space-y-4'}>
      {items.map((item, index) => {
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
          <AdCard
            key={`ad-${item.data.id}-${index}`}
            ad={item.data as Ad}
          />
        );
      })}
    </div>
  );
}
