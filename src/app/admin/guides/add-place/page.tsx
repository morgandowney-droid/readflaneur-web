'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Neighborhood {
  id: string;
  name: string;
  city: string;
}

export default function AddPlacePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    neighborhood_id: '',
    category_id: '',
    name: '',
    address: '',
    description: '',
    website_url: '',
    phone: '',
    price_range: '',
    tags: '',
    is_featured: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const supabase = createClient();

    const [{ data: cats }, { data: hoods }] = await Promise.all([
      supabase.from('guide_categories').select('id, name, slug').order('display_order'),
      supabase.from('neighborhoods').select('id, name, city').eq('is_active', true).order('city'),
    ]);

    setCategories(cats || []);
    setNeighborhoods(hoods || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    // Check if user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('You must be logged in');
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      setError('You must be an admin to add places');
      setLoading(false);
      return;
    }

    // Insert the place
    const { error: insertError } = await supabase.from('guide_listings').insert({
      neighborhood_id: formData.neighborhood_id,
      category_id: formData.category_id,
      name: formData.name,
      address: formData.address || null,
      description: formData.description || null,
      website_url: formData.website_url || null,
      phone: formData.phone || null,
      price_range: formData.price_range || null,
      tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : [],
      is_featured: formData.is_featured,
      is_active: true,
      discovered_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    // Reset form
    setFormData({
      neighborhood_id: formData.neighborhood_id, // Keep neighborhood selected
      category_id: '',
      name: '',
      address: '',
      description: '',
      website_url: '',
      phone: '',
      price_range: '',
      tags: '',
      is_featured: false,
    });
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-light mb-2">Add Place to Guide</h1>
        <p className="text-sm text-neutral-500 mb-8">
          Manually add a place that wasn't found by Google Places.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm">
            Place added successfully! Add another or{' '}
            <button
              onClick={() => router.back()}
              className="underline"
            >
              go back
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 border border-neutral-200">
          {/* Neighborhood */}
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
              Neighborhood *
            </label>
            <select
              required
              value={formData.neighborhood_id}
              onChange={(e) => setFormData({ ...formData, neighborhood_id: e.target.value })}
              className="w-full border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-black"
            >
              <option value="">Select neighborhood...</option>
              {neighborhoods.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}, {n.city}
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
              Category *
            </label>
            <select
              required
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              className="w-full border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-black"
            >
              <option value="">Select category...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
              Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Bubby's"
              className="w-full border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-black"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
              Address
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="e.g., 120 Hudson St, New York, NY"
              className="w-full border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-black"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="A brief description of the place..."
              rows={3}
              className="w-full border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-black"
            />
          </div>

          {/* Website */}
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
              Website
            </label>
            <input
              type="url"
              value={formData.website_url}
              onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
              placeholder="https://..."
              className="w-full border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-black"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="(212) 555-1234"
              className="w-full border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-black"
            />
          </div>

          {/* Price Range */}
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
              Price Range
            </label>
            <select
              value={formData.price_range}
              onChange={(e) => setFormData({ ...formData, price_range: e.target.value })}
              className="w-full border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-black"
            >
              <option value="">Select...</option>
              <option value="$">$ - Inexpensive</option>
              <option value="$$">$$ - Moderate</option>
              <option value="$$$">$$$ - Expensive</option>
              <option value="$$$$">$$$$ - Very Expensive</option>
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="e.g., brunch, family-friendly, outdoor seating"
              className="w-full border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-black"
            />
          </div>

          {/* Featured */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_featured"
              checked={formData.is_featured}
              onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="is_featured" className="text-sm">
              Mark as Featured
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-3 text-sm uppercase tracking-wide hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading ? 'Adding...' : 'Add Place'}
          </button>
        </form>
      </div>
    </div>
  );
}
