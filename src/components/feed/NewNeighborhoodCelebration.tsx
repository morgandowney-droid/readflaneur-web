'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const IS_LIVE_DISPLAY_MS = 10000;

interface Props {
  neighborhoodName: string;
  neighborhoodId: string;
}

/**
 * Shown when a user just created a community neighborhood (?created=true).
 * The countdown happens in the modal - this page shows the celebration
 * (balloons + "is live" message) then loads the feed.
 */
export function NewNeighborhoodCelebration({ neighborhoodName, neighborhoodId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isCreated = searchParams.get('created') === 'true';

  const [ready, setReady] = useState(false);
  const [showBalloons, setShowBalloons] = useState(false);

  // Poll for the first published article
  const checkForArticle = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('articles')
        .select('id')
        .eq('neighborhood_id', neighborhoodId)
        .eq('status', 'published')
        .limit(1);
      return data && data.length > 0;
    } catch { /* ignore */ }
    return false;
  }, [neighborhoodId]);

  useEffect(() => {
    if (!isCreated) return;

    const showLive = () => {
      setReady(true);
      setShowBalloons(true);
      setTimeout(() => {
        router.replace(window.location.pathname);
        router.refresh();
      }, IS_LIVE_DISPLAY_MS);
    };

    // Check immediately (article should already exist from pipeline)
    checkForArticle().then(found => {
      if (found) showLive();
    });

    // Poll every 3s as fallback
    const poller = setInterval(async () => {
      const found = await checkForArticle();
      if (found) {
        clearInterval(poller);
        showLive();
      }
    }, 3000);

    // Safety: stop polling after 90s, show page anyway
    const safety = setTimeout(() => {
      clearInterval(poller);
      setReady(true);
      setTimeout(() => {
        router.replace(window.location.pathname);
        router.refresh();
      }, 3000);
    }, 90000);

    return () => {
      clearInterval(poller);
      clearTimeout(safety);
    };
  }, [isCreated, checkForArticle, router]);

  if (!isCreated) return null;

  return (
    <div className="text-center py-16 px-4 relative overflow-hidden">
      {/* Balloon celebration */}
      {showBalloons && (
        <div className="fixed inset-0 pointer-events-none z-50" aria-hidden="true">
          {Array.from({ length: 24 }).map((_, i) => (
            <span
              key={i}
              className="absolute text-2xl md:text-3xl animate-balloon"
              style={{
                left: `${4 + (i * 4) % 92}%`,
                animationDelay: `${(i * 0.15)}s`,
                animationDuration: `${2.5 + (i % 3) * 0.5}s`,
              }}
            >
              {['🎈', '🎉', '🎊', '✨'][i % 4]}
            </span>
          ))}
        </div>
      )}

      {!ready ? (
        <>
          {/* Brief loading state (article should already exist, this is just a fallback) */}
          <div className="flex justify-center mb-6">
            <div className="w-3 h-3 rounded-full bg-accent animate-pulse" />
          </div>
          <p className="text-sm text-fg-subtle">
            Loading your {neighborhoodName} stories...
          </p>
        </>
      ) : (
        <>
          <h2 className="text-lg font-medium text-fg mb-2">
            {neighborhoodName} is live
          </h2>
          <p className="text-sm text-fg-subtle max-w-sm mx-auto leading-relaxed mb-4">
            Your first daily brief is ready. A new edition will arrive every morning at 7 am local time.
          </p>
          <p className="text-xs text-fg-subtle/60">
            Loading your stories...
          </p>
        </>
      )}
    </div>
  );
}
