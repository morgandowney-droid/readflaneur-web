'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

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

type SortOption = 'featured' | 'rating' | 'reviews' | 'distance';

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
                : 'text-neutral-200 fill-neutral-200'
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

export default function GuidesPage() {
  const params = useParams();
  const city = params.city as string;
  const neighborhood = params.neighborhood as string;

  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('featured');
  const [initialLoading, setInitialLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [neighborhoodName, setNeighborhoodName] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Build neighborhood ID from URL params
  const cityPrefixMap: Record<string, string> = {
    'new-york': 'nyc',
    'san-francisco': 'sf',
    'london': 'london',
    'sydney': 'sydney',
    'stockholm': 'stockholm',
  };
  const prefix = cityPrefixMap[city] || city;
  const neighborhoodId = `${prefix}-${neighborhood}`;

  useEffect(() => {
    fetchGuides(true);
  }, [neighborhoodId]);

  useEffect(() => {
    if (!initialLoading) {
      fetchGuides(false);
    }
  }, [selectedCategory, selectedSubcategory, sortBy, userLocation]);

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

  const fetchGuides = async (isInitial: boolean) => {
    if (isInitial) {
      setInitialLoading(true);
    } else {
      setFilterLoading(true);
    }

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

      const res = await fetch(url);
      const data = await res.json();

      if (res.ok) {
        setCategories(data.categories || []);
        setSubcategories(data.subcategories || []);
        setListings(data.listings || []);

        if (!neighborhoodName) {
          const formattedName = neighborhood
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          setNeighborhoodName(formattedName);
        }
      }
    } catch (error) {
      console.error('Failed to load guides:', error);
    } finally {
      if (isInitial) {
        setInitialLoading(false);
      } else {
        setFilterLoading(false);
      }
    }
  };

  const formattedCity = city
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  if (initialLoading) {
    return (
      <div className="py-8 px-4">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="inline-block w-8 h-8 border-2 border-neutral-200 border-t-black rounded-full animate-spin mb-4" />
              <p className="text-neutral-400 text-sm">Loading guides...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 px-4">
      <div className="mx-auto max-w-5xl">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            href={`/${city}/${neighborhood}`}
            className="text-xs tracking-widest uppercase text-neutral-400 hover:text-black"
          >
            &larr; {neighborhoodName || neighborhood}
          </Link>
        </div>

        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-light mb-1">
            {neighborhoodName || neighborhood} Guide
          </h1>
          <p className="text-sm text-neutral-500">
            The best places in {neighborhoodName}, {formattedCity}.
          </p>
        </header>

        {/* Filters Row */}
        <div className="mb-6 space-y-3">
          {/* Sort Options */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-neutral-400 uppercase tracking-wide">Sort:</span>
            <button
              onClick={() => setSortBy('featured')}
              className={`px-3 py-1.5 text-xs transition-colors ${
                sortBy === 'featured'
                  ? 'bg-black text-white'
                  : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
              }`}
            >
              Featured
            </button>
            <button
              onClick={() => setSortBy('rating')}
              className={`px-3 py-1.5 text-xs transition-colors ${
                sortBy === 'rating'
                  ? 'bg-black text-white'
                  : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
              }`}
            >
              Top Rated
            </button>
            <button
              onClick={() => setSortBy('reviews')}
              className={`px-3 py-1.5 text-xs transition-colors ${
                sortBy === 'reviews'
                  ? 'bg-black text-white'
                  : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
              }`}
            >
              Most Reviewed
            </button>
            <button
              onClick={() => {
                if (userLocation) {
                  setSortBy('distance');
                } else {
                  requestLocation();
                }
              }}
              className={`px-3 py-1.5 text-xs transition-colors flex items-center gap-1 ${
                sortBy === 'distance'
                  ? 'bg-black text-white'
                  : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Near Me
            </button>
            {locationError && (
              <span className="text-xs text-red-500">{locationError}</span>
            )}
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => {
                setSelectedCategory(null);
                setSelectedSubcategory(null);
              }}
              disabled={filterLoading}
              className={`px-3 py-1.5 text-xs whitespace-nowrap transition-colors disabled:opacity-50 ${
                !selectedCategory
                  ? 'bg-black text-white'
                  : 'border border-neutral-200 hover:border-black'
              }`}
            >
              All
            </button>
            {categories
              .filter(cat => cat.listing_count > 0)
              .map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(cat.slug);
                    setSelectedSubcategory(null);
                  }}
                  disabled={filterLoading}
                  className={`px-3 py-1.5 text-xs whitespace-nowrap transition-colors disabled:opacity-50 ${
                    selectedCategory === cat.slug
                      ? 'bg-black text-white'
                      : 'border border-neutral-200 hover:border-black'
                  }`}
                >
                  {cat.icon} {cat.name}
                </button>
              ))}
          </div>

          {/* Subcategory Filter (if Services selected) */}
          {subcategories.length > 0 && selectedCategory === 'services' && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setSelectedSubcategory(null)}
                disabled={filterLoading}
                className={`px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors disabled:opacity-50 ${
                  !selectedSubcategory
                    ? 'bg-neutral-800 text-white'
                    : 'bg-neutral-50 border border-neutral-200 hover:border-neutral-400'
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
            <div className="inline-block w-6 h-6 border-2 border-neutral-200 border-t-black rounded-full animate-spin" />
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-12 bg-neutral-50">
            <p className="text-neutral-500 mb-2">No listings yet.</p>
            <p className="text-sm text-neutral-400">Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((listing) => (
              <div
                key={listing.id}
                className={`border bg-white overflow-hidden ${
                  listing.is_featured ? 'border-black' : 'border-neutral-200'
                }`}
              >
                {/* Photo */}
                {listing.google_photo_url && (
                  <div className="relative h-32 bg-neutral-100">
                    <img
                      src={listing.google_photo_url}
                      alt={listing.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    {listing.is_featured && (
                      <span className="absolute top-2 left-2 text-[9px] tracking-[0.15em] uppercase bg-black text-white px-2 py-0.5">
                        Featured
                      </span>
                    )}
                  </div>
                )}

                <div className="p-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-sm font-medium leading-tight">{listing.name}</h3>
                    {listing.price_range && (
                      <span className="text-xs text-neutral-400 shrink-0">{listing.price_range}</span>
                    )}
                  </div>

                  {/* Rating */}
                  <StarRating rating={listing.google_rating} reviewCount={listing.google_reviews_count} />

                  {/* Address & Distance */}
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

                  {/* Description */}
                  {listing.description && (
                    <p className="mt-2 text-xs text-neutral-600 line-clamp-2">{listing.description}</p>
                  )}

                  {/* Actions */}
                  <div className="mt-3 flex gap-3 text-xs">
                    {listing.website_url && (
                      <a
                        href={listing.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neutral-400 hover:text-black transition-colors"
                      >
                        Website
                      </a>
                    )}
                    {listing.phone && (
                      <a
                        href={`tel:${listing.phone}`}
                        className="text-neutral-400 hover:text-black transition-colors"
                      >
                        Call
                      </a>
                    )}
                    {listing.latitude && listing.longitude && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${listing.latitude},${listing.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neutral-400 hover:text-black transition-colors"
                      >
                        Map
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Category Grid (when showing all) */}
        {!filterLoading && !selectedCategory && listings.length > 0 && (
          <div className="mt-12 pt-8 border-t border-neutral-200">
            <h2 className="text-xs tracking-[0.2em] uppercase text-neutral-400 mb-4">
              Browse by Category
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.slug)}
                  className={`p-3 text-left border transition-colors ${
                    cat.listing_count > 0
                      ? 'border-neutral-200 hover:border-black'
                      : 'border-neutral-100 opacity-50 cursor-not-allowed'
                  }`}
                  disabled={cat.listing_count === 0}
                >
                  <span className="text-xl mb-1 block">{cat.icon}</span>
                  <span className="text-xs font-medium block">{cat.name}</span>
                  <span className="text-[10px] text-neutral-400">
                    {cat.listing_count} {cat.listing_count === 1 ? 'place' : 'places'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
