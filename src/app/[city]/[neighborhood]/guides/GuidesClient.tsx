'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ComboInfo } from '@/lib/combo-utils';
import { ComboNeighborhoodCards } from '@/components/feed/ComboNeighborhoodCards';
import { getWikipediaUrl } from '@/lib/neighborhood-utils';

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
  listing_count: number;
}

interface Subcategory {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  icon: string;
}

interface Listing {
  id: string;
  name: string;
  address: string;
  description: string;
  website_url: string | null;
  phone: string | null;
  price_range: string | null;
  tags: string[] | null;
  image_url: string | null;
  google_photo_url: string | null;
  google_rating: number | null;
  google_reviews_count: number | null;
  latitude: number | null;
  longitude: number | null;
  distance: number | null;
  is_featured: boolean;
  isNew?: boolean;
  isClosed?: boolean;
  michelin_stars: number | null;
  michelin_designation: 'star' | 'bib_gourmand' | 'green_star' | null;
  category: {
    id: string;
    name: string;
    slug: string;
    icon: string;
  } | null;
  subcategory: {
    id: string;
    name: string;
    slug: string;
    icon: string;
  } | null;
}

type SortOption = 'best' | 'rating' | 'reviews' | 'distance';

// Display name mapping for categories
const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  'restaurants': 'Restaurants',
  'coffee-cafes': 'Coffee',
  'shopping': 'Stores',
  'arts-culture': 'Arts',
  'parks-recreation': 'Parks',
};

// Order for category tabs
const CATEGORY_ORDER = ['restaurants', 'coffee-cafes', 'shopping', 'arts-culture', 'parks-recreation'];

const BOOKMARKS_KEY = 'flaneur-guide-bookmarks';

function getMapsUrl(listing: { name: string; address: string | null; latitude: number | null; longitude: number | null }): string {
  const query = listing.address
    ? `${listing.name}, ${listing.address}`
    : listing.name;

  if (listing.latitude && listing.longitude) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&center=${listing.latitude},${listing.longitude}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function StarRating({ rating, reviewCount }: { rating: number | null; reviewCount: number | null }) {
  if (!rating) return null;

  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center">
        {[...Array(5)].map((_, i) => (
          <svg
            key={i}
            className={`w-3.5 h-3.5 ${
              i < fullStars
                ? 'text-yellow-400 fill-yellow-400'
                : i === fullStars && hasHalfStar
                ? 'text-yellow-400 fill-yellow-400/50'
                : 'text-neutral-600 fill-neutral-600'
            }`}
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <span className="text-xs text-neutral-500">
        {rating.toFixed(1)}
        {reviewCount && <span className="text-neutral-400"> ({reviewCount.toLocaleString()})</span>}
      </span>
    </div>
  );
}

function MichelinBadge({ stars, designation }: { stars: number | null; designation: 'star' | 'bib_gourmand' | 'green_star' | null }) {
  if (!stars && !designation) return null;

  if (stars && stars > 0) {
    return (
      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-600 text-white">
        <span className="text-[10px] font-semibold tracking-wide">MICHELIN</span>
        <span className="flex">
          {[...Array(stars)].map((_, i) => (
            <svg key={i} className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          ))}
        </span>
      </div>
    );
  }

  if (designation === 'bib_gourmand') {
    return (
      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-600 text-white">
        <span className="text-[10px] font-semibold tracking-wide">BIB GOURMAND</span>
      </div>
    );
  }

  if (designation === 'green_star') {
    return (
      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-700 text-white">
        <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        <span className="text-[10px] font-semibold tracking-wide">GREEN STAR</span>
      </div>
    );
  }

  return null;
}

interface GuidesClientProps {
  city: string;
  neighborhood: string;
  neighborhoodName: string;
  neighborhoodId: string;
  comboInfo?: ComboInfo | null;
  initialData: {
    categories: Category[];
    subcategories: Subcategory[];
    listings: Listing[];
    newCount: number;
    closedCount: number;
    michelinCount: number;
  };
}

export function GuidesClient({
  city,
  neighborhood,
  neighborhoodName,
  neighborhoodId,
  comboInfo,
  initialData,
}: GuidesClientProps) {
  const [categories, setCategories] = useState<Category[]>(initialData.categories);
  const [subcategories, setSubcategories] = useState<Subcategory[]>(initialData.subcategories);
  const [listings, setListings] = useState<Listing[]>(initialData.listings);
  const [selectedCategory, setSelectedCategory] = useState<string | null>('restaurants');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('best');
  const [filterLoading, setFilterLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'new' | 'closed'>('all');
  const [newCount, setNewCount] = useState(initialData.newCount);
  const [closedCount, setClosedCount] = useState(initialData.closedCount);
  const [michelinCount, setMichelinCount] = useState(initialData.michelinCount);
  const [showMichelinOnly, setShowMichelinOnly] = useState(false);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [showBookmarks, setShowBookmarks] = useState(false);

  const formattedCity = city
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Load bookmarks from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(BOOKMARKS_KEY);
    if (stored) {
      try {
        setBookmarks(new Set(JSON.parse(stored)));
      } catch {
        // Invalid stored data
      }
    }
  }, []);

  const toggleBookmark = (listingId: string) => {
    const newBookmarks = new Set(bookmarks);
    if (newBookmarks.has(listingId)) {
      newBookmarks.delete(listingId);
    } else {
      newBookmarks.add(listingId);
    }
    setBookmarks(newBookmarks);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(Array.from(newBookmarks)));
  };

  const shareListing = async (listing: Listing) => {
    const shareData = {
      title: listing.name,
      text: `Check out ${listing.name} in ${neighborhoodName}`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled or error
      }
    } else {
      await navigator.clipboard.writeText(`${listing.name} - ${window.location.href}`);
      alert('Link copied to clipboard');
    }
  };

  useEffect(() => {
    fetchGuides();
  }, [selectedCategory, selectedSubcategory, sortBy, userLocation, filterStatus, showMichelinOnly]);

  useEffect(() => {
    if (filterStatus === 'new' && newCount === 0) {
      setFilterStatus('all');
    } else if (filterStatus === 'closed' && closedCount === 0) {
      setFilterStatus('all');
    }
  }, [newCount, closedCount]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationError(null);
        setSortBy('distance');
      },
      (error) => {
        setLocationError('Unable to get location');
        console.error('Geolocation error:', error);
      }
    );
  };

  const fetchGuides = async () => {
    setFilterLoading(true);

    try {
      let url = `/api/guides?neighborhoodId=${neighborhoodId}&sort=${sortBy}`;
      if (selectedCategory) {
        url += `&category=${selectedCategory}`;
      }
      if (selectedSubcategory) {
        url += `&subcategory=${selectedSubcategory}`;
      }
      if (userLocation) {
        url += `&lat=${userLocation.lat}&lng=${userLocation.lng}`;
      }
      if (filterStatus !== 'all') {
        url += `&filter=${filterStatus}`;
      }
      if (showMichelinOnly) {
        url += '&michelin=true';
      }

      const res = await fetch(url);
      const data = await res.json();

      if (res.ok) {
        setCategories(data.categories || []);
        setSubcategories(data.subcategories || []);
        setListings(data.listings || []);
        setNewCount(data.newCount || 0);
        setMichelinCount(data.michelinCount || 0);
        setClosedCount(data.closedCount || 0);
      }
    } catch (error) {
      console.error('Failed to load guides:', error);
    } finally {
      setFilterLoading(false);
    }
  };

  return (
    <div className="py-8 px-4">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <header className="mb-8">
          {/* Back button */}
          <div className="mb-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs tracking-wide text-neutral-500 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </Link>
          </div>

          {/* Main header row */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 mb-0.5">
                {formattedCity}
              </p>
              <h1 className="text-lg font-light tracking-wide">
                {neighborhoodName}
              </h1>
              {/* Show "Includes: ..." text for combo neighborhoods */}
              {comboInfo && comboInfo.components.length > 0 && (
                <p className="text-xs text-neutral-400 mt-0.5">
                  Includes: {comboInfo.components.map(c => c.name).join(', ')}
                </p>
              )}
            </div>

            {/* Only show single nav links for non-combo neighborhoods */}
            {!comboInfo && (
              <div className="flex items-center gap-2">
                <Link
                  href={`/${city}/${neighborhood}`}
                  className="text-xs tracking-widest uppercase text-neutral-500 hover:text-white transition-colors px-2 py-1"
                >
                  News
                </Link>
                <span className="text-xs tracking-widest uppercase text-neutral-100 px-2 py-1 border-b border-neutral-100">
                  Places
                </span>
                <a
                  href={`https://www.google.com/maps/place/${encodeURIComponent(neighborhoodName + ', ' + formattedCity)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs tracking-widest uppercase text-neutral-500 hover:text-white transition-colors px-2 py-1"
                >
                  Map
                </a>
                <a
                  href={getWikipediaUrl(neighborhoodId, neighborhoodName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs tracking-widest uppercase text-neutral-500 hover:text-white transition-colors px-2 py-1"
                >
                  Wiki
                </a>
              </div>
            )}

            {/* For combo neighborhoods, just show News link */}
            {comboInfo && (
              <div className="flex items-center gap-2">
                <Link
                  href={`/${city}/${neighborhood}`}
                  className="text-xs tracking-widest uppercase text-neutral-500 hover:text-white transition-colors px-2 py-1"
                >
                  News
                </Link>
                <span className="text-xs tracking-widest uppercase text-neutral-100 px-2 py-1 border-b border-neutral-100">
                  Places
                </span>
              </div>
            )}
          </div>

          {/* Show component cards for combo neighborhoods */}
          {comboInfo && comboInfo.components.length > 0 && (
            <div className="mt-4">
              <ComboNeighborhoodCards
                components={comboInfo.components}
                citySlug={city}
              />
            </div>
          )}
        </header>

        {/* Filters Row */}
        <div className="mb-6 space-y-3">
          {/* Sort Options */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setSortBy('best')}
              className={`px-2.5 py-1.5 text-[11px] transition-colors ${
                sortBy === 'best'
                  ? 'bg-amber-600 text-white'
                  : 'text-neutral-500 hover:text-white'
              }`}
            >
              Best
            </button>
            <button
              onClick={() => setSortBy('rating')}
              className={`px-2.5 py-1.5 text-[11px] transition-colors ${
                sortBy === 'rating'
                  ? 'bg-amber-600 text-white'
                  : 'text-neutral-500 hover:text-white'
              }`}
            >
              Stars
            </button>
            <button
              onClick={() => setSortBy('reviews')}
              className={`px-2.5 py-1.5 text-[11px] transition-colors ${
                sortBy === 'reviews'
                  ? 'bg-amber-600 text-white'
                  : 'text-neutral-500 hover:text-white'
              }`}
            >
              Review Count
            </button>
            <button
              onClick={() => {
                if (userLocation) {
                  setSortBy('distance');
                } else {
                  requestLocation();
                }
              }}
              className={`px-2.5 py-1.5 text-[11px] transition-colors flex items-center gap-0.5 ${
                sortBy === 'distance'
                  ? 'bg-amber-600 text-white'
                  : 'text-neutral-500 hover:text-white'
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Near Me
            </button>

            {newCount > 0 && (
              <button
                onClick={() => setFilterStatus(filterStatus === 'new' ? 'all' : 'new')}
                className={`px-2 py-1 text-[11px] transition-colors ${
                  filterStatus === 'new'
                    ? 'bg-green-600 text-white'
                    : 'bg-green-900/30 text-green-400'
                }`}
              >
                New
              </button>
            )}
            {closedCount > 0 && (
              <button
                onClick={() => setFilterStatus(filterStatus === 'closed' ? 'all' : 'closed')}
                className={`px-2 py-1 text-[11px] transition-colors ${
                  filterStatus === 'closed'
                    ? 'bg-red-600 text-white'
                    : 'bg-red-900/30 text-red-400'
                }`}
              >
                Closed
              </button>
            )}

            {michelinCount > 0 && (
              <button
                onClick={() => setShowMichelinOnly(!showMichelinOnly)}
                className={`px-2 py-1 text-[11px] transition-colors flex items-center gap-1 ${
                  showMichelinOnly
                    ? 'bg-red-600 text-white'
                    : 'bg-red-900/30 text-red-400'
                }`}
              >
                <span>★</span>
                Michelin
              </button>
            )}

            {locationError && (
              <span className="text-[10px] text-red-500">{locationError}</span>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex gap-1.5">
            {CATEGORY_ORDER.map((catSlug) => {
              const cat = categories.find(c => c.slug === catSlug);
              if (!cat) return null;
              const displayName = CATEGORY_DISPLAY_NAMES[catSlug] || cat.name;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(cat.slug);
                    setSelectedSubcategory(null);
                    setShowBookmarks(false);
                  }}
                  disabled={filterLoading}
                  className={`px-2.5 py-1.5 text-[11px] whitespace-nowrap transition-colors disabled:opacity-50 ${
                    selectedCategory === cat.slug && !showBookmarks
                      ? 'bg-amber-600 text-white'
                      : 'border border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  {displayName}
                </button>
              );
            })}
            <button
              onClick={() => setShowBookmarks(true)}
              disabled={filterLoading}
              className={`px-2.5 py-1.5 text-[11px] whitespace-nowrap transition-colors disabled:opacity-50 flex items-center gap-1 ${
                showBookmarks
                  ? 'bg-amber-600 text-white'
                  : 'border border-white/[0.08] hover:border-white/20'
              }`}
            >
              <svg className="w-3 h-3" fill={showBookmarks ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Saved{bookmarks.size > 0 && ` (${bookmarks.size})`}
            </button>
          </div>

          {/* Subcategory Filter */}
          {subcategories.length > 0 && selectedCategory === 'services' && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setSelectedSubcategory(null)}
                disabled={filterLoading}
                className={`px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors disabled:opacity-50 ${
                  !selectedSubcategory
                    ? 'bg-amber-600 text-white'
                    : 'bg-surface border border-white/[0.08] hover:border-white/20'
                }`}
              >
                All Services
              </button>
              {subcategories.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setSelectedSubcategory(sub.slug)}
                  disabled={filterLoading}
                  className={`px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors disabled:opacity-50 ${
                    selectedSubcategory === sub.slug
                      ? 'bg-neutral-800 text-white'
                      : 'bg-neutral-50 border border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  {sub.icon} {sub.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Listings */}
        {filterLoading ? (
          <div className="text-center py-12">
            <div className="inline-block w-6 h-6 border-2 border-white/[0.08] border-t-white rounded-full animate-spin" />
          </div>
        ) : showBookmarks ? (
          bookmarks.size === 0 ? (
            <div className="text-center py-12 bg-surface">
              <p className="text-neutral-500 mb-2">No saved places yet.</p>
              <p className="text-sm text-neutral-400">Tap "Save" on any place to bookmark it.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {listings.filter(l => bookmarks.has(l.id)).map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  index={0}
                  bookmarks={bookmarks}
                  toggleBookmark={toggleBookmark}
                  shareListing={shareListing}
                  showRank={false}
                />
              ))}
            </div>
          )
        ) : listings.length === 0 ? (
          <div className="text-center py-12 bg-neutral-50">
            <p className="text-neutral-500 mb-2">No listings yet.</p>
            <p className="text-sm text-neutral-400">Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((listing, index) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                index={index}
                bookmarks={bookmarks}
                toggleBookmark={toggleBookmark}
                shareListing={shareListing}
                showRank={true}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ListingCard({
  listing,
  index,
  bookmarks,
  toggleBookmark,
  shareListing,
  showRank,
}: {
  listing: Listing;
  index: number;
  bookmarks: Set<string>;
  toggleBookmark: (id: string) => void;
  shareListing: (listing: Listing) => void;
  showRank: boolean;
}) {
  return (
    <div className="border border-white/[0.08] bg-surface overflow-hidden">
      {listing.google_photo_url && (
        <div className="relative h-32 bg-neutral-800">
          {showRank && (
            <div className="absolute top-2 left-2 z-10 w-6 h-6 bg-black text-white text-xs font-medium flex items-center justify-center">
              {index + 1}
            </div>
          )}
          {(listing.michelin_stars || listing.michelin_designation) && (
            <div className="absolute top-2 right-2 z-10">
              <MichelinBadge stars={listing.michelin_stars} designation={listing.michelin_designation} />
            </div>
          )}
          <img
            src={listing.google_photo_url}
            alt={listing.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            {!listing.google_photo_url && showRank && (
              <span className="w-5 h-5 bg-black text-white text-[10px] font-medium flex items-center justify-center shrink-0">
                {index + 1}
              </span>
            )}
            <h3 className="text-sm font-medium leading-tight truncate">{listing.name}</h3>
            {!listing.google_photo_url && (listing.michelin_stars || listing.michelin_designation) && (
              <MichelinBadge stars={listing.michelin_stars} designation={listing.michelin_designation} />
            )}
            {listing.isNew && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-900/30 text-green-400 uppercase tracking-wide shrink-0">
                New
              </span>
            )}
            {listing.isClosed && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-red-900/30 text-red-400 uppercase tracking-wide shrink-0">
                Closed
              </span>
            )}
          </div>
          {listing.price_range && (
            <span className="text-xs text-neutral-400 shrink-0">{listing.price_range}</span>
          )}
        </div>

        {(listing.subcategory?.name || listing.category?.name) && (
          <p className="text-[11px] text-neutral-400 mb-1">
            {listing.subcategory?.name || listing.category?.name}
          </p>
        )}

        <StarRating rating={listing.google_rating} reviewCount={listing.google_reviews_count} />

        <div className="mt-1.5 flex items-center gap-2 text-xs text-neutral-500">
          {listing.address && (
            <span className="truncate">{listing.address}</span>
          )}
          {listing.distance !== null && (
            <span className="shrink-0 text-neutral-400">
              {listing.distance < 1
                ? `${Math.round(listing.distance * 1000)}m`
                : `${listing.distance.toFixed(1)}km`}
            </span>
          )}
        </div>

        {listing.description && (
          <p className="mt-2 text-xs text-neutral-400 line-clamp-2">{listing.description}</p>
        )}

        <div className="mt-3 flex items-center gap-1 text-xs -ml-2">
          {listing.website_url && (
            <a
              href={listing.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-white transition-colors px-2 py-1.5 min-h-[44px] flex items-center"
            >
              Website
            </a>
          )}
          {listing.phone && (
            <a
              href={`tel:${listing.phone}`}
              className="text-neutral-400 hover:text-white transition-colors px-2 py-1.5 min-h-[44px] flex items-center"
            >
              Call
            </a>
          )}
          {(listing.latitude && listing.longitude) || listing.address ? (
            <a
              href={getMapsUrl(listing)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-white transition-colors px-2 py-1.5 min-h-[44px] flex items-center"
            >
              Directions
            </a>
          ) : null}
          <button
            onClick={() => shareListing(listing)}
            className="text-neutral-400 hover:text-white transition-colors px-2 py-1.5 min-h-[44px] flex items-center"
          >
            Share
          </button>
          <button
            onClick={() => toggleBookmark(listing.id)}
            className={`transition-colors px-2 py-1.5 min-h-[44px] flex items-center ${
              bookmarks.has(listing.id)
                ? 'text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            {bookmarks.has(listing.id) ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
