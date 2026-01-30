'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface NeighborhoodConfig {
  has_listings_api: boolean;
  listings_api_source: string | null;
  has_public_sales: boolean;
  currency: string;
  currency_symbol: string;
  enable_crowdsourced_sightings: boolean;
  enable_storefront_tracking: boolean;
  enable_development_tracking: boolean;
}

interface PropertySighting {
  id: string;
  sighting_type: string;
  address: string | null;
  location_description: string | null;
  property_type: string | null;
  asking_price: number | null;
  ai_summary: string | null;
  is_notable: boolean;
  first_spotted_at: string;
  verification_count: number;
}

interface StorefrontChange {
  id: string;
  change_type: string;
  address: string;
  business_name: string | null;
  previous_business_name: string | null;
  business_type: string | null;
  ai_summary: string | null;
  first_spotted_at: string;
}

interface DevelopmentProject {
  id: string;
  project_type: string;
  status: string;
  address: string;
  description: string | null;
  floors: number | null;
  units: number | null;
  use_type: string | null;
  ai_summary: string | null;
  is_notable: boolean;
  first_spotted_at: string;
}

interface RealEstateMove {
  id: string;
  address: string;
  move_type: string;
  current_price: number | null;
  price_change: number | null;
  sold_price: number | null;
  ai_summary: string | null;
  is_notable: boolean;
  move_date: string;
}

interface WeeklyDigest {
  ai_summary: string | null;
  new_for_sale: number;
  storefronts_opening: number;
  storefronts_closing: number;
  new_construction: number;
}

type TabType = 'all' | 'for-sale' | 'storefronts' | 'development';

function formatPrice(price: number | null, symbol: string): string {
  if (!price) return '';
  if (price >= 1000000) {
    return `${symbol}${(price / 1000000).toFixed(1)}M`;
  }
  return `${symbol}${(price / 1000).toFixed(0)}K`;
}

function timeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const days = Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return then.toLocaleDateString();
}

function SightingIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    for_sale: '🏠',
    for_rent: '🔑',
    sold: '✓',
    construction: '🏗️',
    renovation: '🔨',
    demolition: '💥',
    vacant: '⬜',
    new_business: '✨',
    closing_business: '🚪',
  };
  return <span>{icons[type] || '📍'}</span>;
}

function StorefrontIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    opening: '🎉',
    closing: '🚪',
    renovation: '🔨',
    for_lease: '📋',
    name_change: '🔄',
  };
  return <span>{icons[type] || '🏪'}</span>;
}

function ProjectIcon({ type, status }: { type: string; status: string }) {
  if (status === 'completed') return <span>✅</span>;
  if (status === 'stalled') return <span>⏸️</span>;
  const icons: Record<string, string> = {
    new_construction: '🏗️',
    renovation: '🔨',
    demolition: '💥',
    conversion: '🔄',
  };
  return <span>{icons[type] || '🏢'}</span>;
}

export default function PropertyWatchPage() {
  const params = useParams();
  const city = params.city as string;
  const neighborhood = params.neighborhood as string;

  const [config, setConfig] = useState<NeighborhoodConfig | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [sightings, setSightings] = useState<PropertySighting[]>([]);
  const [storefronts, setStorefronts] = useState<StorefrontChange[]>([]);
  const [projects, setProjects] = useState<DevelopmentProject[]>([]);
  const [listings, setListings] = useState<RealEstateMove[]>([]);
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [neighborhoodName, setNeighborhoodName] = useState('');
  const [showSubmitForm, setShowSubmitForm] = useState(false);

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
    fetchData();
  }, [neighborhoodId]);

  const fetchData = async () => {
    setLoading(true);
    const supabase = createClient();

    // Fetch neighborhood config
    const { data: configData } = await supabase
      .from('neighborhood_property_config')
      .select('*')
      .eq('neighborhood_id', neighborhoodId)
      .single();

    // Default config if not found
    const neighborhoodConfig: NeighborhoodConfig = configData || {
      has_listings_api: false,
      listings_api_source: null,
      has_public_sales: false,
      currency: 'USD',
      currency_symbol: '$',
      enable_crowdsourced_sightings: true,
      enable_storefront_tracking: true,
      enable_development_tracking: true,
    };
    setConfig(neighborhoodConfig);

    // Fetch property sightings
    const { data: sightingsData } = await supabase
      .from('property_sightings')
      .select('*')
      .eq('neighborhood_id', neighborhoodId)
      .eq('is_published', true)
      .eq('is_resolved', false)
      .order('first_spotted_at', { ascending: false })
      .limit(30);
    setSightings(sightingsData || []);

    // Fetch storefront changes
    const { data: storefrontsData } = await supabase
      .from('storefront_changes')
      .select('*')
      .eq('neighborhood_id', neighborhoodId)
      .eq('is_published', true)
      .order('first_spotted_at', { ascending: false })
      .limit(20);
    setStorefronts(storefrontsData || []);

    // Fetch development projects
    const { data: projectsData } = await supabase
      .from('development_projects')
      .select('*')
      .eq('neighborhood_id', neighborhoodId)
      .eq('is_published', true)
      .in('status', ['planned', 'active'])
      .order('first_spotted_at', { ascending: false })
      .limit(20);
    setProjects(projectsData || []);

    // If US neighborhood with listings API, fetch from real_estate_moves
    if (neighborhoodConfig.has_listings_api) {
      const { data: listingsData } = await supabase
        .from('real_estate_moves')
        .select('*')
        .eq('neighborhood_id', neighborhoodId)
        .eq('is_published', true)
        .order('move_date', { ascending: false })
        .limit(30);
      setListings(listingsData || []);
    }

    // Fetch latest digest
    const { data: digestData } = await supabase
      .from('property_watch_digests')
      .select('*')
      .eq('neighborhood_id', neighborhoodId)
      .eq('is_published', true)
      .order('week_end', { ascending: false })
      .limit(1)
      .single();
    setDigest(digestData);

    // Set neighborhood name
    const formattedName = neighborhood
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    setNeighborhoodName(formattedName);

    setLoading(false);
  };

  const formattedCity = city
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  if (loading) {
    return (
      <div className="py-8 px-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-center py-24">
            <div className="inline-block w-8 h-8 border-2 border-neutral-200 border-t-black rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  const currencySymbol = config?.currency_symbol || '$';

  // Combine and sort all items for "All" view
  const allItems = [
    ...sightings.map(s => ({ ...s, _type: 'sighting' as const, _date: s.first_spotted_at })),
    ...storefronts.map(s => ({ ...s, _type: 'storefront' as const, _date: s.first_spotted_at })),
    ...projects.map(p => ({ ...p, _type: 'project' as const, _date: p.first_spotted_at })),
    ...(config?.has_listings_api ? listings.map(l => ({ ...l, _type: 'listing' as const, _date: l.move_date })) : []),
  ].sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime());

  return (
    <div className="py-8 px-4">
      <div className="mx-auto max-w-3xl">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            href={`/${city}/${neighborhood}`}
            className="text-xs tracking-widest uppercase text-neutral-400 hover:text-black"
          >
            &larr; {neighborhoodName}
          </Link>
        </div>

        {/* Header */}
        <header className="mb-6">
          <h1 className="text-2xl font-light mb-1">Property Watch</h1>
          <p className="text-sm text-neutral-500">
            What's changing in {neighborhoodName}, {formattedCity}.
          </p>
        </header>

        {/* Weekly Digest */}
        {digest?.ai_summary && (
          <div className="mb-6 p-4 bg-neutral-50 border border-neutral-200">
            <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">This Week</p>
            <p className="text-sm text-neutral-700">{digest.ai_summary}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
              activeTab === 'all' ? 'bg-black text-white' : 'border border-neutral-200 hover:border-black'
            }`}
          >
            All Activity
          </button>
          {(config?.has_listings_api || sightings.filter(s => ['for_sale', 'for_rent', 'sold'].includes(s.sighting_type)).length > 0) && (
            <button
              onClick={() => setActiveTab('for-sale')}
              className={`px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
                activeTab === 'for-sale' ? 'bg-black text-white' : 'border border-neutral-200 hover:border-black'
              }`}
            >
              🏠 For Sale/Rent
            </button>
          )}
          <button
            onClick={() => setActiveTab('storefronts')}
            className={`px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
              activeTab === 'storefronts' ? 'bg-black text-white' : 'border border-neutral-200 hover:border-black'
            }`}
          >
            🏪 Storefronts
          </button>
          <button
            onClick={() => setActiveTab('development')}
            className={`px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
              activeTab === 'development' ? 'bg-black text-white' : 'border border-neutral-200 hover:border-black'
            }`}
          >
            🏗️ Development
          </button>
        </div>

        {/* Content */}
        {activeTab === 'all' && (
          <div className="space-y-0 divide-y divide-neutral-100">
            {allItems.length === 0 ? (
              <div className="text-center py-12 bg-neutral-50">
                <p className="text-neutral-500">No activity yet.</p>
                <p className="text-sm text-neutral-400 mt-1">Be the first to report something.</p>
              </div>
            ) : (
              allItems.slice(0, 30).map((item) => (
                <div key={`${item._type}-${item.id}`} className="py-3">
                  {item._type === 'sighting' && (
                    <div className="flex items-start gap-3">
                      <span className="text-lg"><SightingIcon type={(item as PropertySighting).sighting_type} /></span>
                      <div className="flex-1">
                        <p className="text-sm">{(item as PropertySighting).ai_summary || (item as PropertySighting).address || (item as PropertySighting).location_description}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
                          {(item as PropertySighting).asking_price && (
                            <span>{formatPrice((item as PropertySighting).asking_price, currencySymbol)}</span>
                          )}
                          <span>{timeAgo(item._date)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {item._type === 'storefront' && (
                    <div className="flex items-start gap-3">
                      <span className="text-lg"><StorefrontIcon type={(item as StorefrontChange).change_type} /></span>
                      <div className="flex-1">
                        <p className="text-sm">{(item as StorefrontChange).ai_summary || `${(item as StorefrontChange).business_name || 'Business'} ${(item as StorefrontChange).change_type} at ${(item as StorefrontChange).address}`}</p>
                        <p className="text-xs text-neutral-500 mt-1">{timeAgo(item._date)}</p>
                      </div>
                    </div>
                  )}
                  {item._type === 'project' && (
                    <div className="flex items-start gap-3">
                      <span className="text-lg"><ProjectIcon type={(item as DevelopmentProject).project_type} status={(item as DevelopmentProject).status} /></span>
                      <div className="flex-1">
                        <p className="text-sm">{(item as DevelopmentProject).ai_summary || `${(item as DevelopmentProject).project_type} at ${(item as DevelopmentProject).address}`}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
                          <span className="capitalize">{(item as DevelopmentProject).status}</span>
                          <span>{timeAgo(item._date)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {item._type === 'listing' && (
                    <div className="flex items-start gap-3">
                      <span className="text-lg">
                        {(item as RealEstateMove).move_type === 'price_drop' ? '↓' :
                         (item as RealEstateMove).move_type === 'sold' ? '✓' :
                         (item as RealEstateMove).move_type === 'new_listing' ? '★' : '🏠'}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm">{(item as RealEstateMove).ai_summary || (item as RealEstateMove).address}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
                          {(item as RealEstateMove).current_price && (
                            <span>{formatPrice((item as RealEstateMove).current_price, currencySymbol)}</span>
                          )}
                          {(item as RealEstateMove).price_change && (
                            <span className={(item as RealEstateMove).price_change! < 0 ? 'text-green-600' : 'text-red-600'}>
                              {formatPrice((item as RealEstateMove).price_change, currencySymbol)}
                            </span>
                          )}
                          <span>{timeAgo(item._date)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'for-sale' && (
          <div className="space-y-0 divide-y divide-neutral-100">
            {/* Show listings if API available, otherwise show crowdsourced sightings */}
            {config?.has_listings_api ? (
              listings.length === 0 ? (
                <div className="text-center py-12 bg-neutral-50">
                  <p className="text-neutral-500">No listings data yet.</p>
                </div>
              ) : (
                listings.map((listing) => (
                  <div key={listing.id} className={`py-3 ${listing.is_notable ? 'bg-neutral-50 -mx-4 px-4' : ''}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-lg">
                        {listing.move_type === 'price_drop' ? <span className="text-green-600">↓</span> :
                         listing.move_type === 'sold' ? <span className="text-blue-600">●</span> :
                         listing.move_type === 'new_listing' ? <span className="text-purple-600">★</span> : '🏠'}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm">{listing.ai_summary || listing.address}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500">
                          {listing.current_price && <span>{formatPrice(listing.current_price, currencySymbol)}</span>}
                          {listing.price_change && (
                            <span className={listing.price_change < 0 ? 'text-green-600' : 'text-red-600'}>
                              {listing.price_change < 0 ? '' : '+'}{formatPrice(listing.price_change, currencySymbol)}
                            </span>
                          )}
                          <span>{timeAgo(listing.move_date)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )
            ) : (
              // Crowdsourced sightings for non-US
              sightings.filter(s => ['for_sale', 'for_rent', 'sold'].includes(s.sighting_type)).length === 0 ? (
                <div className="text-center py-12 bg-neutral-50">
                  <p className="text-neutral-500">No sightings yet.</p>
                  <p className="text-sm text-neutral-400 mt-1">Spot a "For Sale" sign? Report it below.</p>
                </div>
              ) : (
                sightings
                  .filter(s => ['for_sale', 'for_rent', 'sold'].includes(s.sighting_type))
                  .map((sighting) => (
                    <div key={sighting.id} className={`py-3 ${sighting.is_notable ? 'bg-neutral-50 -mx-4 px-4' : ''}`}>
                      <div className="flex items-start gap-3">
                        <span className="text-lg"><SightingIcon type={sighting.sighting_type} /></span>
                        <div className="flex-1">
                          <p className="text-sm">{sighting.ai_summary || sighting.address || sighting.location_description}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
                            {sighting.asking_price && <span>{formatPrice(sighting.asking_price, currencySymbol)}</span>}
                            {sighting.verification_count > 1 && <span>{sighting.verification_count} reports</span>}
                            <span>{timeAgo(sighting.first_spotted_at)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
              )
            )}
          </div>
        )}

        {activeTab === 'storefronts' && (
          <div className="space-y-0 divide-y divide-neutral-100">
            {storefronts.length === 0 ? (
              <div className="text-center py-12 bg-neutral-50">
                <p className="text-neutral-500">No storefront changes tracked yet.</p>
              </div>
            ) : (
              storefronts.map((storefront) => (
                <div key={storefront.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <span className="text-lg"><StorefrontIcon type={storefront.change_type} /></span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {storefront.business_name || 'Business'}
                        <span className="font-normal text-neutral-500"> · {storefront.change_type}</span>
                      </p>
                      {storefront.ai_summary && (
                        <p className="text-sm text-neutral-600 mt-0.5">{storefront.ai_summary}</p>
                      )}
                      <p className="text-xs text-neutral-500 mt-1">
                        {storefront.address} · {timeAgo(storefront.first_spotted_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'development' && (
          <div className="space-y-0 divide-y divide-neutral-100">
            {projects.length === 0 ? (
              <div className="text-center py-12 bg-neutral-50">
                <p className="text-neutral-500">No development projects tracked yet.</p>
              </div>
            ) : (
              projects.map((project) => (
                <div key={project.id} className={`py-3 ${project.is_notable ? 'bg-neutral-50 -mx-4 px-4' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-lg"><ProjectIcon type={project.project_type} status={project.status} /></span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {project.address}
                        <span className="font-normal text-neutral-500 capitalize"> · {project.status}</span>
                      </p>
                      {project.ai_summary && (
                        <p className="text-sm text-neutral-600 mt-0.5">{project.ai_summary}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
                        <span className="capitalize">{project.project_type.replace('_', ' ')}</span>
                        {project.floors && <span>{project.floors} floors</span>}
                        {project.units && <span>{project.units} units</span>}
                        <span>{timeAgo(project.first_spotted_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Submit CTA */}
        <div className="mt-8 p-6 bg-neutral-50 border border-neutral-200">
          <p className="text-sm text-neutral-600 mb-1 font-medium">See something changing?</p>
          <p className="text-xs text-neutral-500 mb-4">
            For sale signs, construction, new storefronts, closures - help track what's happening.
          </p>
          <button
            onClick={() => setShowSubmitForm(!showSubmitForm)}
            className="px-6 py-2 bg-black text-white text-xs tracking-widest uppercase hover:bg-neutral-800 transition-colors"
          >
            Report a Sighting
          </button>

          {showSubmitForm && (
            <PropertySightingForm
              neighborhoodId={neighborhoodId}
              currencySymbol={currencySymbol}
              onSubmit={() => {
                setShowSubmitForm(false);
                fetchData();
              }}
            />
          )}
        </div>

        {/* Data source note */}
        <p className="mt-6 text-xs text-neutral-400 text-center">
          {config?.has_listings_api
            ? `Listings data from ${config.listings_api_source}. Crowdsourced sightings from the community.`
            : 'All data crowdsourced from the community.'}
        </p>
      </div>
    </div>
  );
}

// Simple inline form for submitting property sightings
function PropertySightingForm({
  neighborhoodId,
  currencySymbol,
  onSubmit,
}: {
  neighborhoodId: string;
  currencySymbol: string;
  onSubmit: () => void;
}) {
  const [type, setType] = useState('for_sale');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const supabase = createClient();

    await supabase.from('property_sightings').insert({
      neighborhood_id: neighborhoodId,
      sighting_type: type,
      address: address || null,
      location_description: address || null,
      description: description || null,
      asking_price: price ? parseInt(price.replace(/[^0-9]/g, '')) : null,
      source_type: 'user_tip',
      is_published: false, // Requires moderation
    });

    setSubmitting(false);
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3 pt-4 border-t border-neutral-200">
      <div>
        <label className="block text-xs text-neutral-500 mb-1">What did you see?</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-neutral-200 focus:border-black focus:outline-none"
        >
          <option value="for_sale">For Sale sign</option>
          <option value="for_rent">For Rent sign</option>
          <option value="sold">Sold sign</option>
          <option value="construction">Construction/scaffolding</option>
          <option value="renovation">Renovation work</option>
          <option value="vacant">Vacant storefront</option>
          <option value="new_business">New business opening</option>
          <option value="closing_business">Business closing</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-neutral-500 mb-1">Where? (address or description)</label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g., 142 Perry Street or corner of Perry and Bleecker"
          className="w-full px-3 py-2 text-sm border border-neutral-200 focus:border-black focus:outline-none"
          required
        />
      </div>

      {['for_sale', 'for_rent'].includes(type) && (
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Asking price (if visible)</label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-sm text-neutral-400">{currencySymbol}</span>
            <input
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g., 2,500,000"
              className="w-full pl-7 pr-3 py-2 text-sm border border-neutral-200 focus:border-black focus:outline-none"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs text-neutral-500 mb-1">Any other details?</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional: what you noticed, agent name, etc."
          rows={2}
          className="w-full px-3 py-2 text-sm border border-neutral-200 focus:border-black focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !address}
        className="w-full py-2 bg-black text-white text-xs tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50"
      >
        {submitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
}
