'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Props {
  neighborhoodName: string;
  neighborhoodId: string;
}

/**
 * Shown when a user just created a community neighborhood (?created=true).
 * Polls for the first article, shows a countdown, and celebrates with balloons.
 */
export function NewNeighborhoodCelebration({ neighborhoodName, neighborhoodId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isCreated = searchParams.get('created') === 'true';

  const [elapsed, setElapsed] = useState(0);
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

    // Check immediately (article may already exist from pipeline)
    checkForArticle().then(found => {
      if (found) {
        setReady(true);
        setShowBalloons(true);
        setTimeout(() => {
          router.replace(window.location.pathname);
          router.refresh();
        }, 4000);
      }
    });

    // Countdown timer
    const timer = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    // Poll every 3s for article
    const poller = setInterval(async () => {
      const found = await checkForArticle();
      if (found) {
        setReady(true);
        setShowBalloons(true);
        clearInterval(poller);
        setTimeout(() => {
          router.replace(window.location.pathname);
          router.refresh();
        }, 4000);
      }
    }, 3000);

    // Safety: stop polling after 90s, show page anyway
    const safety = setTimeout(() => {
      clearInterval(poller);
      setReady(true);
      setTimeout(() => {
        router.replace(window.location.pathname);
        router.refresh();
      }, 2000);
    }, 90000);

    return () => {
      clearInterval(timer);
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
          {/* Pulsing dot */}
          <div className="flex justify-center mb-6">
            <div className="w-3 h-3 rounded-full bg-accent animate-pulse" />
          </div>

          {/* Countdown */}
          <div className="text-3xl font-mono text-fg mb-4 tabular-nums">
            {elapsed}s
          </div>

          <h2 className="text-sm tracking-[0.25em] uppercase font-light text-fg mb-3">
            Building your {neighborhoodName} edition
          </h2>
          <p className="text-sm text-fg-subtle max-w-sm mx-auto leading-relaxed">
            Scanning local sources, writing your first daily brief, and selecting photos.
            This usually takes 15-20 seconds.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-lg font-medium text-fg mb-2">
            {neighborhoodName} is live
          </h2>
          <p className="text-sm text-fg-subtle max-w-sm mx-auto leading-relaxed">
            Your first daily brief is ready. You&apos;ll receive a new edition every morning at 7am local time.
          </p>
        </>
      )}
    </div>
  );
}
