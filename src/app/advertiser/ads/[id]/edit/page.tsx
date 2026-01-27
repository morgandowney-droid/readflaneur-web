'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Ad } from '@/types';

export default function EditAdPage() {
  const router = useRouter();
  const params = useParams();
  const adId = params.id as string;

  const [ad, setAd] = useState<Ad | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    headline: '',
    imageUrl: '',
    clickUrl: '',
  });

  useEffect(() => {
    let mounted = true;

    async function loadAd() {
      try {
        const supabase = createClient();

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (!mounted) return;

        if (sessionError || !session?.user) {
          router.push('/login?redirect=/advertiser');
          return;
        }

        const { data: adData, error: adError } = await supabase
          .from('ads')
          .select('*')
          .eq('id', adId)
          .eq('advertiser_id', session.user.id)
          .single();

        if (!mounted) return;

        if (adError || !adData) {
          setError('Ad not found or you do not have permission to edit it.');
          setLoading(false);
          return;
        }

        setAd(adData as Ad);
        setFormData({
          headline: adData.headline,
          imageUrl: adData.image_url,
          clickUrl: adData.click_url,
        });
        setLoading(false);
      } catch (err) {
        console.error('Error loading ad:', err);
        if (mounted) {
          router.push('/login?redirect=/advertiser');
        }
      }
    }

    loadAd();

    return () => {
      mounted = false;
    };
  }, [adId, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const supabase = createClient();

    const { error: updateError } = await supabase
      .from('ads')
      .update({
        headline: formData.headline,
        image_url: formData.imageUrl,
        click_url: formData.clickUrl,
      })
      .eq('id', adId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      router.push('/advertiser');
    }, 1500);
  };

  if (loading) {
    return (
      <div className="py-12 px-4">
        <div className="mx-auto max-w-2xl">
          <p className="text-neutral-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (error && !ad) {
    return (
      <div className="py-12 px-4">
        <div className="mx-auto max-w-2xl">
          <div className="p-4 bg-red-50 border border-red-200 text-red-600 mb-6">
            {error}
          </div>
          <Link
            href="/advertiser"
            className="text-sm text-neutral-500 hover:text-black"
          >
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-light">Edit Ad</h1>
          <span
            className={`px-3 py-1 text-xs tracking-widest uppercase ${
              ad?.status === 'active'
                ? 'bg-green-100 text-green-800'
                : ad?.status === 'paused'
                  ? 'bg-orange-100 text-orange-800'
                  : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {ad?.status}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 text-sm text-green-600 bg-green-50 border border-green-200">
              Ad updated successfully! Redirecting...
            </div>
          )}

          <div>
            <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Headline
            </label>
            <input
              type="text"
              value={formData.headline}
              onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
              required
              maxLength={100}
              className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none"
              placeholder="Your compelling headline"
            />
          </div>

          <div>
            <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Image URL
            </label>
            <input
              type="url"
              value={formData.imageUrl}
              onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
              required
              className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none"
              placeholder="https://example.com/image.jpg"
            />
            <p className="text-xs text-neutral-400 mt-1">
              Recommended: 1200x675px (16:9 aspect ratio)
            </p>
            {formData.imageUrl && (
              <div className="mt-3">
                <p className="text-xs text-neutral-400 mb-2">Preview:</p>
                <img
                  src={formData.imageUrl}
                  alt="Ad preview"
                  className="w-full max-w-sm h-auto object-cover border border-neutral-200"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Click URL
            </label>
            <input
              type="url"
              value={formData.clickUrl}
              onChange={(e) => setFormData({ ...formData, clickUrl: e.target.value })}
              required
              className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none"
              placeholder="https://yourwebsite.com"
            />
          </div>

          <div className="pt-4 border-t border-neutral-200 flex gap-4">
            <button
              type="submit"
              disabled={saving || success}
              className="flex-1 bg-black text-white py-3 text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : success ? 'Saved!' : 'Save Changes'}
            </button>
            <Link
              href="/advertiser"
              className="px-6 py-3 border border-neutral-200 text-sm tracking-widest uppercase hover:border-black transition-colors text-center"
            >
              Cancel
            </Link>
          </div>
        </form>

        <div className="mt-8 p-4 bg-neutral-50 border border-neutral-200">
          <p className="text-sm text-neutral-600">
            <strong>Note:</strong> Changes to your ad will take effect immediately.
            Targeting (neighborhood or global) cannot be changed after purchase.
          </p>
        </div>
      </div>
    </div>
  );
}
