'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface Listing {
  id: string;
  name: string;
  address: string | null;
  google_rating: number | null;
  google_reviews_count: number | null;
  michelin_stars: number | null;
  michelin_designation: 'star' | 'bib_gourmand' | 'green_star' | null;
  neighborhood: {
    id: string;
    name: string;
    city: string;
  } | null;
  category: {
    name: string;
    slug: string;
  } | null;
}

interface Neighborhood {
  id: string;
  name: string;
  city: string;
}

type MichelinDesignation = 'star' | 'bib_gourmand' | 'green_star' | null;

export default function MichelinAdminPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>('');
  const [showOnlyMichelin, setShowOnlyMichelin] = useState(false);
  const [showOnlyRestaurants, setShowOnlyRestaurants] = useState(true);

  useEffect(() => {
    loadData();
  }, [selectedCity, selectedNeighborhood, showOnlyMichelin, showOnlyRestaurants]);

  const loadData = async () => {
    setLoading(true);
    const supabase = createClient();

    // Load neighborhoods for filter
    const { data: hoods } = await supabase
      .from('neighborhoods')
      .select('id, name, city')
      .eq('is_active', true)
      .order('city');

    setNeighborhoods(hoods || []);

    // Build query for listings
    let query = supabase
      .from('guide_listings')
      .select(`
        id,
        name,
        address,
        google_rating,
        google_reviews_count,
        michelin_stars,
        michelin_designation,
        neighborhood:neighborhoods(id, name, city),
        category:guide_categories(name, slug)
      `)
      .eq('is_active', true)
      .order('name');

    // Filter by neighborhood
    if (selectedNeighborhood) {
      query = query.eq('neighborhood_id', selectedNeighborhood);
    } else if (selectedCity) {
      // Get neighborhood IDs for this city
      const cityHoods = (hoods || []).filter(h => h.city === selectedCity);
      if (cityHoods.length > 0) {
        query = query.in('neighborhood_id', cityHoods.map(h => h.id));
      }
    }

    // Filter to only show restaurants (most relevant for Michelin)
    if (showOnlyRestaurants) {
      const { data: restaurantCategory } = await supabase
        .from('guide_categories')
        .select('id')
        .eq('slug', 'restaurants')
        .single();

      if (restaurantCategory) {
        query = query.eq('category_id', restaurantCategory.id);
      }
    }

    // Filter to show only Michelin-rated
    if (showOnlyMichelin) {
      query = query.or('michelin_stars.not.is.null,michelin_designation.not.is.null');
    }

    const { data, error: queryError } = await query.limit(200);

    if (queryError) {
      setError(queryError.message);
    } else {
      setListings((data || []) as unknown as Listing[]);
    }

    setLoading(false);
  };

  const filteredListings = listings.filter(listing => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      listing.name.toLowerCase().includes(searchLower) ||
      listing.address?.toLowerCase().includes(searchLower) ||
      listing.neighborhood?.name.toLowerCase().includes(searchLower) ||
      listing.neighborhood?.city.toLowerCase().includes(searchLower)
    );
  });

  const updateMichelin = async (
    listingId: string,
    stars: number | null,
    designation: MichelinDesignation
  ) => {
    setSaving(listingId);
    setError(null);
    setSuccess(null);

    const supabase = createClient();

    // Check admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('You must be logged in');
      setSaving(null);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      setError('You must be an admin');
      setSaving(null);
      return;
    }

    // Update the listing
    const { error: updateError } = await supabase
      .from('guide_listings')
      .update({
        michelin_stars: stars,
        michelin_designation: designation,
        updated_at: new Date().toISOString(),
      })
      .eq('id', listingId);

    if (updateError) {
      setError(updateError.message);
    } else {
      // Update local state
      setListings(prev => prev.map(l =>
        l.id === listingId
          ? { ...l, michelin_stars: stars, michelin_designation: designation }
          : l
      ));
      setSuccess(`Updated ${listings.find(l => l.id === listingId)?.name}`);
      setTimeout(() => setSuccess(null), 3000);
    }

    setSaving(null);
  };

  const clearMichelin = async (listingId: string) => {
    await updateMichelin(listingId, null, null);
  };

  // Get unique cities
  const cities = [...new Set(neighborhoods.map(n => n.city))].sort();

  // Get neighborhoods for selected city
  const filteredNeighborhoods = selectedCity
    ? neighborhoods.filter(n => n.city === selectedCity)
    : neighborhoods;

  // Count Michelin-rated places
  const michelinCount = listings.filter(l => l.michelin_stars || l.michelin_designation).length;

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-light mb-1">Michelin Ratings</h1>
            <p className="text-sm text-neutral-500">
              Manage Michelin star ratings and designations for restaurants.
            </p>
          </div>
          <Link
            href="/admin/guides/add-place"
            className="px-4 py-2 bg-black text-white text-sm hover:bg-neutral-800"
          >
            Add Place
          </Link>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm">
            {success}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border border-neutral-200 p-4 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
                Search
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Restaurant name..."
                className="w-full border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-black"
              />
            </div>

            {/* City Filter */}
            <div>
              <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
                City
              </label>
              <select
                value={selectedCity}
                onChange={(e) => {
                  setSelectedCity(e.target.value);
                  setSelectedNeighborhood('');
                }}
                className="w-full border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-black"
              >
                <option value="">All Cities</option>
                {cities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>

            {/* Neighborhood Filter */}
            <div>
              <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
                Neighborhood
              </label>
              <select
                value={selectedNeighborhood}
                onChange={(e) => setSelectedNeighborhood(e.target.value)}
                className="w-full border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-black"
              >
                <option value="">All Neighborhoods</option>
                {filteredNeighborhoods.map(n => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>

            {/* Toggles */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlyRestaurants}
                  onChange={(e) => setShowOnlyRestaurants(e.target.checked)}
                  className="w-4 h-4"
                />
                Restaurants only
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlyMichelin}
                  onChange={(e) => setShowOnlyMichelin(e.target.checked)}
                  className="w-4 h-4"
                />
                Michelin-rated only
              </label>
            </div>
          </div>

          {/* Stats */}
          <div className="text-xs text-neutral-500 pt-2 border-t border-neutral-100">
            Showing {filteredListings.length} of {listings.length} places
            {michelinCount > 0 && (
              <span className="ml-2 text-red-600">
                ({michelinCount} Michelin-rated)
              </span>
            )}
          </div>
        </div>

        {/* Listings Table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-2 border-neutral-200 border-t-black rounded-full animate-spin" />
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="text-center py-12 bg-white border border-neutral-200">
            <p className="text-neutral-500">No restaurants found.</p>
            <p className="text-sm text-neutral-400 mt-1">Try adjusting your filters.</p>
          </div>
        ) : (
          <div className="bg-white border border-neutral-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-neutral-500 font-medium">
                    Restaurant
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-neutral-500 font-medium hidden md:table-cell">
                    Location
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-neutral-500 font-medium hidden sm:table-cell">
                    Google
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-neutral-500 font-medium">
                    Michelin
                  </th>
                  <th className="text-right px-4 py-3 text-xs uppercase tracking-wide text-neutral-500 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredListings.map(listing => (
                  <tr key={listing.id} className="hover:bg-neutral-50">
                    {/* Restaurant Name */}
                    <td className="px-4 py-3">
                      <div className="font-medium">{listing.name}</div>
                      {listing.address && (
                        <div className="text-xs text-neutral-400 truncate max-w-[200px]">
                          {listing.address}
                        </div>
                      )}
                    </td>

                    {/* Location */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="text-neutral-600">
                        {listing.neighborhood?.name}
                      </div>
                      <div className="text-xs text-neutral-400">
                        {listing.neighborhood?.city}
                      </div>
                    </td>

                    {/* Google Rating */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {listing.google_rating ? (
                        <div className="flex items-center gap-1">
                          <span className="text-yellow-500">★</span>
                          <span>{listing.google_rating.toFixed(1)}</span>
                          {listing.google_reviews_count && (
                            <span className="text-neutral-400 text-xs">
                              ({listing.google_reviews_count.toLocaleString()})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>

                    {/* Michelin Status */}
                    <td className="px-4 py-3">
                      <MichelinSelector
                        stars={listing.michelin_stars}
                        designation={listing.michelin_designation}
                        onChange={(stars, designation) => updateMichelin(listing.id, stars, designation)}
                        disabled={saving === listing.id}
                      />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      {(listing.michelin_stars || listing.michelin_designation) && (
                        <button
                          onClick={() => clearMichelin(listing.id)}
                          disabled={saving === listing.id}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                        >
                          Clear
                        </button>
                      )}
                      {saving === listing.id && (
                        <span className="text-xs text-neutral-400 ml-2">Saving...</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 p-4 bg-white border border-neutral-200">
          <h3 className="text-xs uppercase tracking-wide text-neutral-500 font-medium mb-3">
            Michelin Designations
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-semibold">
                ★
              </span>
              <span className="ml-2 text-neutral-600">1 Star - High quality</span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-semibold">
                ★★
              </span>
              <span className="ml-2 text-neutral-600">2 Stars - Excellent</span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-semibold">
                ★★★
              </span>
              <span className="ml-2 text-neutral-600">3 Stars - Exceptional</span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-semibold">
                BIB
              </span>
              <span className="ml-2 text-neutral-600">Bib Gourmand - Great value</span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-700 text-white text-[10px] font-semibold">
                ★
              </span>
              <span className="ml-2 text-neutral-600">Green Star - Sustainable</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Michelin rating selector component
function MichelinSelector({
  stars,
  designation,
  onChange,
  disabled,
}: {
  stars: number | null;
  designation: MichelinDesignation;
  onChange: (stars: number | null, designation: MichelinDesignation) => void;
  disabled: boolean;
}) {
  // Current display
  const hasRating = stars || designation;

  if (hasRating) {
    // Show current rating as badge
    return (
      <div className="flex items-center gap-2">
        {stars && stars > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-semibold">
            {'★'.repeat(stars)}
          </span>
        )}
        {designation === 'bib_gourmand' && (
          <span className="inline-flex items-center px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-semibold">
            BIB
          </span>
        )}
        {designation === 'green_star' && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-700 text-white text-[10px] font-semibold">
            ★ GREEN
          </span>
        )}
      </div>
    );
  }

  // Show dropdown to add rating
  return (
    <select
      disabled={disabled}
      onChange={(e) => {
        const value = e.target.value;
        if (!value) return;

        if (value === '1' || value === '2' || value === '3') {
          onChange(parseInt(value), 'star');
        } else if (value === 'bib') {
          onChange(null, 'bib_gourmand');
        } else if (value === 'green') {
          onChange(null, 'green_star');
        }
      }}
      className="border border-neutral-200 px-2 py-1 text-xs focus:outline-none focus:border-black disabled:opacity-50"
      defaultValue=""
    >
      <option value="">Add rating...</option>
      <option value="1">★ 1 Star</option>
      <option value="2">★★ 2 Stars</option>
      <option value="3">★★★ 3 Stars</option>
      <option value="bib">Bib Gourmand</option>
      <option value="green">Green Star</option>
    </select>
  );
}
