'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';

interface ListItem {
  id: string;
  name: string;
  city: string;
  country: string;
  imageUrl: string | null;
  photographer: string | null;
}

interface SharedList {
  name: string;
  creatorName: string | null;
  shareToken: string;
  createdAt: string;
  items: ListItem[];
}

export function SharedListClient({ list }: { list: SharedList }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/lists/${list.shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (navigator.share) {
        navigator.share({ title: list.name, url }).catch(() => {});
      }
    }
  };

  // Group items by country for visual interest
  const uniqueCountries = [...new Set(list.items.map(i => i.country))];

  return (
    <main className="min-h-screen bg-canvas">
      {/* Hero section */}
      <div className="max-w-4xl mx-auto px-4 pt-16 pb-10 text-center">
        <p className="text-[11px] tracking-[0.3em] uppercase text-fg-muted mb-4">
          {t('wishlist.sharedList')}
        </p>
        <h1 className="font-display text-4xl md:text-5xl text-fg mb-3">
          {list.name}
        </h1>
        {list.creatorName && (
          <p className="text-sm text-fg-muted mb-2">
            by {list.creatorName}
          </p>
        )}
        <p className="text-sm text-fg-subtle">
          {list.items.length} {t('wishlist.neighborhoods')} {uniqueCountries.length > 1 && `across ${uniqueCountries.length} countries`}
        </p>

        {/* Copy link button */}
        <button
          onClick={handleCopyLink}
          className="mt-6 inline-flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase text-fg-muted border border-border-strong px-5 py-2.5 rounded-sm hover:bg-hover transition-colors"
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {t('wishlist.linkCopied')}
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.504a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.343 8.93" />
              </svg>
              {t('wishlist.copyLink')}
            </>
          )}
        </button>
      </div>

      {/* Divider */}
      <div className="max-w-4xl mx-auto px-4">
        <div className="border-t border-border" />
      </div>

      {/* Neighborhood grid */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {list.items.map(item => (
            <Link
              key={item.id}
              href={`/${getCitySlugFromId(item.id)}/${getNeighborhoodSlugFromId(item.id)}`}
              className="group block"
            >
              {/* Image */}
              <div className="aspect-[4/3] rounded-sm overflow-hidden bg-elevated mb-3">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-elevated flex items-center justify-center">
                    <span className="font-display text-2xl text-fg-subtle">{item.name[0]}</span>
                  </div>
                )}
              </div>

              {/* Text */}
              <h3 className="font-display text-lg text-fg group-hover:text-accent transition-colors">
                {item.name}
              </h3>
              <p className="text-[11px] tracking-[0.15em] uppercase text-fg-muted mt-0.5">
                {item.city}, {item.country}
              </p>
              {item.photographer && (
                <p className="text-[10px] text-fg-subtle mt-1">
                  Photo by {item.photographer}
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="max-w-4xl mx-auto px-4 pb-16 text-center">
        <div className="border-t border-border pt-10">
          <p className="text-[11px] tracking-[0.3em] uppercase text-fg-subtle mb-4">
            FLANEUR
          </p>
          <Link
            href="/destinations"
            className="text-[11px] tracking-[0.2em] uppercase text-fg-muted border border-border-strong px-5 py-2.5 rounded-sm hover:bg-hover transition-colors"
          >
            {t('wishlist.addDestinations')}
          </Link>
        </div>
      </div>
    </main>
  );
}
