'use client';

import { FeedItem, Article, Ad } from '@/types';
import { ArticleCard } from './ArticleCard';
import { AdCard } from './AdCard';

interface FeedListProps {
  items: FeedItem[];
}

export function FeedList({ items }: FeedListProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium mb-2">No stories yet.</p>
        <p className="text-neutral-400">Check back soon for updates.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item, index) => {
        if (item.type === 'article') {
          return (
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
