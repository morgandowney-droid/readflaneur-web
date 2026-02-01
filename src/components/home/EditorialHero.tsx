'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface FeaturedStory {
  headline: string;
  preview: string;
  neighborhood: string;
  imageUrl: string | null;
  url: string;
  publishedAt: string;
}

interface EditorialHeroProps {
  stories: FeaturedStory[];
  rotationInterval?: number; // ms, default 6000
}

export function EditorialHero({ stories, rotationInterval = 6000 }: EditorialHeroProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const goToNext = useCallback(() => {
    if (stories.length <= 1) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % stories.length);
      setIsTransitioning(false);
    }, 300);
  }, [stories.length]);

  const goToPrev = useCallback(() => {
    if (stories.length <= 1) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + stories.length) % stories.length);
      setIsTransitioning(false);
    }, 300);
  }, [stories.length]);

  // Auto-rotate
  useEffect(() => {
    if (isPaused || stories.length <= 1) return;

    const timer = setInterval(goToNext, rotationInterval);
    return () => clearInterval(timer);
  }, [isPaused, stories.length, rotationInterval, goToNext]);

  if (stories.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <p className="text-neutral-400 text-sm">No stories yet</p>
      </div>
    );
  }

  const current = stories[currentIndex];
  const timeAgo = formatTimeAgo(current.publishedAt);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Main Card */}
      <div
        onClick={() => router.push(current.url)}
        className="group cursor-pointer relative overflow-hidden"
      >
        {/* Background Image or Gradient */}
        <div className="relative h-80 md:h-96">
          {current.imageUrl ? (
            <>
              <Image
                src={current.imageUrl}
                alt={current.headline}
                fill
                className={`object-cover transition-all duration-700 ${
                  isTransitioning ? 'opacity-0 scale-105' : 'opacity-100 scale-100'
                } group-hover:scale-105`}
                priority
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
            </>
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 transition-opacity duration-300 ${
              isTransitioning ? 'opacity-0' : 'opacity-100'
            }`} />
          )}

          {/* Content Overlay */}
          <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-10">
            {/* Neighborhood + Time */}
            <div className={`flex items-center gap-3 mb-3 transition-all duration-500 ${
              isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
            }`}>
              <span className="text-xs tracking-[0.2em] uppercase text-white/70 font-medium">
                {current.neighborhood}
              </span>
              <span className="w-1 h-1 rounded-full bg-white/40" />
              <span className="text-xs text-white/50">
                {timeAgo}
              </span>
            </div>

            {/* Headline */}
            <h2 className={`text-2xl md:text-3xl lg:text-4xl font-light text-white leading-tight mb-3 transition-all duration-500 delay-75 ${
              isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
            }`}>
              {current.headline}
            </h2>

            {/* Preview */}
            {current.preview && (
              <p className={`text-sm md:text-base text-white/70 max-w-2xl line-clamp-2 transition-all duration-500 delay-100 ${
                isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
              }`}>
                {current.preview}
              </p>
            )}

            {/* Read indicator */}
            <div className={`mt-4 flex items-center gap-2 text-white/60 group-hover:text-white transition-all duration-500 delay-150 ${
              isTransitioning ? 'opacity-0' : 'opacity-100'
            }`}>
              <span className="text-xs tracking-wider uppercase">Read story</span>
              <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      {stories.length > 1 && (
        <>
          {/* Arrow buttons */}
          <button
            onClick={(e) => { e.stopPropagation(); goToPrev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm text-white/70 hover:bg-black/50 hover:text-white transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
            aria-label="Previous story"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goToNext(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm text-white/70 hover:bg-black/50 hover:text-white transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
            aria-label="Next story"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Progress dots */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {stories.map((_, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  if (idx !== currentIndex) {
                    setIsTransitioning(true);
                    setTimeout(() => {
                      setCurrentIndex(idx);
                      setIsTransitioning(false);
                    }, 300);
                  }
                }}
                className={`transition-all duration-300 ${
                  idx === currentIndex
                    ? 'w-6 h-1.5 bg-white rounded-full'
                    : 'w-1.5 h-1.5 bg-white/40 rounded-full hover:bg-white/60'
                }`}
                aria-label={`Go to story ${idx + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Helper function to format time ago
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
