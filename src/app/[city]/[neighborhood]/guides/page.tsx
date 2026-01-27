'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
  listing_count: number;
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
  is_featured: boolean;
  category: {
    id: string;
    name: string;
    slug: string;
    icon: string;
  } | null;
}

export default function GuidesPage() {
  const params = useParams();
  const city = params.city as string;
  const neighborhood = params.neighborhood as string;

  const [categories, setCategories] = useState<Category[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [neighborhoodName, setNeighborhoodName] = useState('');

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
    fetchGuides();
  }, [neighborhoodId, selectedCategory]);

  const fetchGuides = async () => {
    setLoading(true);
    try {
      let url = `/api/guides?neighborhoodId=${neighborhoodId}`;
      if (selectedCategory) {
        url += `&category=${selectedCategory}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (res.ok) {
        setCategories(data.categories || []);
        setListings(data.listings || []);

        // Set neighborhood name from first listing or derive from URL
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
      setLoading(false);
    }
  };

  const formattedCity = city
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return (
    <div className="py-8 px-4">
      <div className="mx-auto max-w-5xl">
        {/* Breadcrumb */}
        <div className="mb-8">
          <Link
            href={`/${city}/${neighborhood}`}
            className="text-xs tracking-widest uppercase text-neutral-400 hover:text-black"
          >
            &larr; {neighborhoodName || neighborhood}
          </Link>
        </div>

        {/* Header */}
        <header className="mb-12">
          <h1 className="text-3xl font-light mb-2">
            {neighborhoodName || neighborhood} Guide
          </h1>
          <p className="text-neutral-500">
            The best places to eat, drink, shop, and explore in {neighborhoodName}, {formattedCity}.
          </p>
        </header>

        {/* Category Filter */}
        <div className="mb-8 overflow-x-auto">
          <div className="flex gap-2 pb-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 text-sm whitespace-nowrap transition-colors ${
                !selectedCategory
                  ? 'bg-black text-white'
                  : 'border border-neutral-200 hover:border-black'
              }`}
            >
              All ({listings.length})
            </button>
            {categories
              .filter(cat => cat.listing_count > 0)
              .map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.slug)}
                  className={`px-4 py-2 text-sm whitespace-nowrap transition-colors ${
                    selectedCategory === cat.slug
                      ? 'bg-black text-white'
                      : 'border border-neutral-200 hover:border-black'
                  }`}
                >
                  {cat.icon} {cat.name} ({cat.listing_count})
                </button>
              ))}
          </div>
        </div>

        {/* Listings */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-neutral-400">Loading guides...</p>
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-12 bg-neutral-50">
            <p className="text-neutral-500 mb-2">No listings yet for this neighborhood.</p>
            <p className="text-sm text-neutral-400">Check back soon as we add more recommendations.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {listings.map((listing) => (
              <div
                key={listing.id}
                className={`border p-6 ${listing.is_featured ? 'border-black' : 'border-neutral-200'}`}
              >
                {listing.is_featured && (
                  <span className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 mb-2 block">
                    Featured
                  </span>
                )}

                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-medium">{listing.name}</h3>
                  {listing.price_range && (
                    <span className="text-sm text-neutral-400">{listing.price_range}</span>
                  )}
                </div>

                {listing.address && (
                  <p className="text-sm text-neutral-500 mb-2">{listing.address}</p>
                )}

                {listing.description && (
                  <p className="text-sm text-neutral-600 mb-4">{listing.description}</p>
                )}

                {/* Tags */}
                {listing.tags && listing.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {listing.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-1 bg-neutral-100 text-neutral-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-4 text-sm">
                  {listing.website_url && (
                    <a
                      href={listing.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-neutral-400 hover:text-black transition-colors"
                    >
                      Website &rarr;
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
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state categories */}
        {!loading && listings.length > 0 && (
          <div className="mt-12 pt-8 border-t border-neutral-200">
            <h2 className="text-xs tracking-[0.2em] uppercase text-neutral-400 mb-6">
              Browse by Category
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.slug)}
                  className={`p-4 text-left border transition-colors ${
                    cat.listing_count > 0
                      ? 'border-neutral-200 hover:border-black'
                      : 'border-neutral-100 opacity-50 cursor-not-allowed'
                  }`}
                  disabled={cat.listing_count === 0}
                >
                  <span className="text-2xl mb-2 block">{cat.icon}</span>
                  <span className="text-sm font-medium block">{cat.name}</span>
                  <span className="text-xs text-neutral-400">
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
