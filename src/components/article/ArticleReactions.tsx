'use client';

import { useState, useEffect, useCallback } from 'react';

const ANON_ID_KEY = 'flaneur-anonymous-id';

function getAnonymousId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

interface ReactionButton {
  type: 'bookmark' | 'heart' | 'fire';
  icon: string;
  activeIcon: string;
  activeColor: string;
  label: string;
}

const REACTIONS: ReactionButton[] = [
  { type: 'bookmark', icon: '🔖', activeIcon: '🔖', activeColor: 'text-amber-600', label: 'Save' },
  { type: 'heart', icon: '🤍', activeIcon: '❤️', activeColor: 'text-red-500', label: 'Like' },
  { type: 'fire', icon: '🔥', activeIcon: '🔥', activeColor: 'text-orange-500', label: 'Fire' },
];

interface ArticleReactionsProps {
  articleId: string;
}

export function ArticleReactions({ articleId }: ArticleReactionsProps) {
  const [counts, setCounts] = useState<Record<string, number>>({ bookmark: 0, heart: 0, fire: 0 });
  const [active, setActive] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());

  const fetchReactions = useCallback(async () => {
    try {
      const anonymousId = getAnonymousId();
      const res = await fetch(`/api/reactions?articleId=${articleId}&anonymousId=${anonymousId}`);
      if (res.ok) {
        const data = await res.json();
        setCounts(data.counts);
        setActive(new Set(data.userReactions));
      }
    } catch {
      // Network error (common on mobile) - silently ignore, reactions are non-critical
    }
  }, [articleId]);

  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  const toggle = async (type: string) => {
    if (loading.has(type)) return;

    // Optimistic update
    const wasActive = active.has(type);
    const newActive = new Set(active);
    const newCounts = { ...counts };

    if (wasActive) {
      newActive.delete(type);
      newCounts[type] = Math.max(0, (newCounts[type] || 0) - 1);
    } else {
      newActive.add(type);
      newCounts[type] = (newCounts[type] || 0) + 1;
    }

    setActive(newActive);
    setCounts(newCounts);
    setLoading(prev => new Set(prev).add(type));

    try {
      const anonymousId = getAnonymousId();
      await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, reactionType: type, anonymousId }),
      });
    } catch {
      // Revert on failure
      setActive(active);
      setCounts(counts);
    } finally {
      setLoading(prev => {
        const next = new Set(prev);
        next.delete(type);
        return next;
      });
    }
  };

  return (
    <div className="mt-8 pt-6 border-t border-white/[0.08]">
      <div className="flex items-center gap-4">
        {REACTIONS.map((reaction) => {
          const isActive = active.has(reaction.type);
          const count = counts[reaction.type] || 0;

          return (
            <button
              key={reaction.type}
              onClick={() => toggle(reaction.type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${
                isActive
                  ? 'border-white/20 bg-white/5'
                  : 'border-white/[0.08] hover:border-white/20'
              }`}
              title={reaction.label}
            >
              <span className={`text-base ${isActive ? '' : 'grayscale opacity-50'}`}>
                {isActive ? reaction.activeIcon : reaction.icon}
              </span>
              {count > 0 && (
                <span className={`text-xs ${isActive ? reaction.activeColor : 'text-neutral-400'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
