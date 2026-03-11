'use client';

import Image from 'next/image';
import Link from 'next/link';
import { NeighborhoodLiveStatus } from './NeighborhoodLiveStatus';

interface FeedHeroProps {
  imageUrl: string;
  neighborhoodName: string;
  city: string;
  headline?: string;
  articleUrl?: string;
  timezone?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  initialWeather?: { tempC: number; weatherCode: number };
  photographerName?: string;
  photographerUrl?: string;
}

export function FeedHero({
  imageUrl,
  neighborhoodName,
  city,
  headline,
  articleUrl,
  timezone,
  country,
  latitude,
  longitude,
  initialWeather,
  photographerName,
  photographerUrl,
}: FeedHeroProps) {
  return (
    <div className="relative w-full h-[50vh] md:h-[60vh] overflow-hidden group">
      {/* Background image with Ken Burns */}
      <div className="absolute inset-0 animate-ken-burns">
        <Image
          src={imageUrl}
          alt={`${neighborhoodName}, ${city}`}
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
      </div>

      {/* Gradient scrim - LC-inspired warm charcoal */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(32,32,32,0.1) 0%, rgba(32,32,32,0.35) 50%, rgba(32,32,32,0.85) 100%)' }}
      />

      {/* Clickable overlay linking to article */}
      {articleUrl ? (
        <Link href={articleUrl} className="absolute inset-0 z-[1] flex flex-col justify-end cursor-pointer">
          <div className="max-w-5xl mx-auto w-full px-4 md:px-8 pb-6 md:pb-10">
            <p className="text-[11px] tracking-[0.25em] uppercase text-white/60 mb-2 md:mb-3">
              {neighborhoodName} &middot; {city}
            </p>
            {headline && (
              <h2 className="font-display text-2xl md:text-4xl lg:text-5xl text-white font-light leading-tight mb-3 md:mb-4 max-w-3xl group-hover:underline decoration-white/30 underline-offset-4">
                {headline}
              </h2>
            )}
            {timezone && (
              <div className="flex items-center gap-4">
                <NeighborhoodLiveStatus
                  timezone={timezone}
                  country={country}
                  latitude={latitude}
                  longitude={longitude}
                  neighborhoodName={neighborhoodName}
                  city={city}
                  initialWeather={initialWeather}
                />
              </div>
            )}
          </div>
        </Link>
      ) : (
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="max-w-5xl mx-auto w-full px-4 md:px-8 pb-6 md:pb-10">
            <p className="text-[11px] tracking-[0.25em] uppercase text-white/60 mb-2 md:mb-3">
              {neighborhoodName} &middot; {city}
            </p>
            {headline && (
              <h2 className="font-display text-2xl md:text-4xl lg:text-5xl text-white font-light leading-tight mb-3 md:mb-4 max-w-3xl">
                {headline}
              </h2>
            )}
            {timezone && (
              <div className="flex items-center gap-4">
                <NeighborhoodLiveStatus
                  timezone={timezone}
                  country={country}
                  latitude={latitude}
                  longitude={longitude}
                  neighborhoodName={neighborhoodName}
                  city={city}
                  initialWeather={initialWeather}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Photographer credit (outside the link for separate clickability) */}
      {photographerName && (
        <div className="absolute bottom-2 right-3 md:bottom-3 md:right-4 z-[2]">
          <span className="text-[10px] text-white/30">
            Photo by{' '}
            {photographerUrl ? (
              <a
                href={`${photographerUrl}?utm_source=flaneur&utm_medium=referral`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white/50 transition-colors"
              >
                {photographerName}
              </a>
            ) : (
              photographerName
            )}{' '}
            on{' '}
            <a
              href="https://unsplash.com/?utm_source=flaneur&utm_medium=referral"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/50 transition-colors"
            >
              Unsplash
            </a>
          </span>
        </div>
      )}
    </div>
  );
}
