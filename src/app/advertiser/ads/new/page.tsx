'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Neighborhood } from '@/types';

// Mock articles for preview context
const mockArticles = [
  {
    headline: "The 'Quiet Luxury' Dog Walking Uniform Is Now Everywhere",
    image: 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=400&q=80',
  },
  {
    headline: '145 Perry Street: The Penthouse Finally Closes at $12.8M',
    image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=80',
  },
];

function AdPreviewCard({ headline, imageUrl }: { headline: string; imageUrl: string }) {
  return (
    <div className="bg-white overflow-hidden">
      <div className="px-3 py-2">
        <span className="text-[10px] tracking-[0.2em] uppercase text-neutral-400">
          SPONSORED
        </span>
      </div>
      <div className="relative aspect-video w-full bg-neutral-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Ad preview"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-300 text-sm">
            Your image here
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-sm">
          {headline || 'Your headline here'}
        </h3>
      </div>
    </div>
  );
}

function MockArticleCard({ headline, image }: { headline: string; image: string }) {
  return (
    <div className="bg-white overflow-hidden">
      <div className="relative aspect-video w-full">
        <img src={image} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h2 className="text-white text-sm font-semibold leading-tight line-clamp-2">
            {headline}
          </h2>
        </div>
      </div>
    </div>
  );
}

export default function CreateAdPage() {
  const router = useRouter();
  const [step, setStep] = useState<'details' | 'submitted'>('details');
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    headline: '',
    imageUrl: '',
    clickUrl: '',
    isGlobal: false,
    neighborhoodId: '',
    placement: 'feed' as 'feed' | 'story_open',
  });

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const neighborhoodsRes = await supabase
        .from('neighborhoods')
        .select('*')
        .order('city', { ascending: true });

      setNeighborhoods(neighborhoodsRes.data || []);
    }
    fetchData();
  }, []);

  const selectedNeighborhood = neighborhoods.find(n => n.id === formData.neighborhoodId);

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/ads/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: formData.headline,
          imageUrl: formData.imageUrl,
          clickUrl: formData.clickUrl,
          isGlobal: formData.isGlobal,
          neighborhoodId: formData.neighborhoodId,
          placement: formData.placement,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to submit ad');
        setIsLoading(false);
        return;
      }

      if (data.rejected) {
        // AI rejected the ad
        setError(`Your ad was not accepted: ${data.reason}`);
        setIsLoading(false);
        return;
      }

      // Success - ad submitted for review
      setIsLoading(false);
      setStep('submitted');
    } catch (err) {
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  if (step === 'submitted') {
    return (
      <div className="py-12 px-4">
        <div className="mx-auto max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-light mb-4">Ad Submitted for Review</h1>

          <p className="text-neutral-600 mb-6">
            Your ad has passed our initial screening and is now pending manual review.
          </p>

          <div className="bg-blue-50 border border-blue-200 p-4 mb-6">
            <p className="text-sm text-blue-800">
              <strong>You&apos;ll receive an email</strong> at your registered email address once your ad is approved (within 24 hours, usually much more quickly).
            </p>
          </div>

          <div className="bg-neutral-50 p-6 mb-6 text-left">
            <p className="text-xs tracking-widest uppercase text-neutral-400 mb-3">
              What happens next?
            </p>
            <ol className="text-sm text-neutral-600 space-y-3">
              <li><strong>1.</strong> Our team reviews your ad to ensure it meets our guidelines</li>
              <li><strong>2.</strong> You&apos;ll receive an email notification when approved</li>
              <li><strong>3.</strong> Complete payment to make your ad go live</li>
            </ol>
          </div>

          <a
            href="/advertiser"
            className="inline-block bg-black text-white px-8 py-3 text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors"
          >
            View Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Form */}
          <div>
            <h1 className="text-2xl font-light mb-8">Create New Ad</h1>

            {/* Ad Guidelines */}
            <div className="mb-8 p-6 bg-neutral-50 border border-neutral-200">
              <h2 className="text-xs tracking-widest uppercase text-neutral-400 mb-4">
                Creative Guidelines
              </h2>
              <div className="space-y-4 text-sm text-neutral-600">
                <div>
                  <p className="font-medium text-black mb-2">What works well:</p>
                  <ul className="space-y-1 ml-4">
                    <li>• Clean, high-quality photography</li>
                    <li>• Sophisticated, muted color palettes</li>
                    <li>• Local businesses: boutiques, restaurants, cafés, galleries</li>
                    <li>• Professional services, real estate, lifestyle brands</li>
                    <li>• Cultural venues and local events</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-black mb-2">What to avoid:</p>
                  <ul className="space-y-1 ml-4">
                    <li>• Busy graphics, clip art, or excessive text on images</li>
                    <li>• Aggressive calls-to-action or flashy animations</li>
                    <li>• Low-quality or generic stock photography</li>
                    <li>• Garish colors that clash with our editorial aesthetic</li>
                  </ul>
                </div>
                <p className="text-xs text-neutral-400 pt-2 border-t border-neutral-200">
                  Ads that match the Flâneur aesthetic perform significantly better with our readers.
                </p>
              </div>
            </div>

            <form onSubmit={handleDetailsSubmit} className="space-y-6">
              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200">
                  {error}
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

              <div>
                <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
                  Placement
                </label>
                <div className="space-y-3 mb-6">
                  <label className="flex items-center gap-3 p-4 border border-neutral-200 cursor-pointer hover:border-neutral-400">
                    <input
                      type="radio"
                      name="placement"
                      checked={formData.placement === 'feed'}
                      onChange={() => setFormData({ ...formData, placement: 'feed' })}
                      className="w-4 h-4"
                    />
                    <div>
                      <p className="font-medium">Feed Ad</p>
                      <p className="text-sm text-neutral-400">
                        Appears between stories in the neighborhood feed
                      </p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-4 border border-neutral-200 cursor-pointer hover:border-neutral-400">
                    <input
                      type="radio"
                      name="placement"
                      checked={formData.placement === 'story_open'}
                      onChange={() => setFormData({ ...formData, placement: 'story_open' })}
                      className="w-4 h-4"
                    />
                    <div>
                      <p className="font-medium">Story Open Ad</p>
                      <p className="text-sm text-neutral-400">
                        Appears at the top and bottom of individual articles
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
                  Targeting
                </label>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-4 border border-neutral-200 cursor-pointer hover:border-neutral-400">
                    <input
                      type="radio"
                      name="targeting"
                      checked={!formData.isGlobal}
                      onChange={() => setFormData({ ...formData, isGlobal: false })}
                      className="w-4 h-4"
                    />
                    <div>
                      <p className="font-medium">Specific Neighborhood</p>
                      <p className="text-sm text-neutral-400">
                        Target one neighborhood - from $150/week
                      </p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-4 border border-neutral-200 cursor-pointer hover:border-neutral-400">
                    <input
                      type="radio"
                      name="targeting"
                      checked={formData.isGlobal}
                      onChange={() => setFormData({ ...formData, isGlobal: true })}
                      className="w-4 h-4"
                    />
                    <div>
                      <p className="font-medium">Global</p>
                      <p className="text-sm text-neutral-400">
                        Show in all neighborhoods - $3,000/month
                      </p>
                    </div>
                  </label>
                </div>

                {!formData.isGlobal && (
                  <select
                    value={formData.neighborhoodId}
                    onChange={(e) =>
                      setFormData({ ...formData, neighborhoodId: e.target.value })
                    }
                    required={!formData.isGlobal}
                    className="w-full mt-3 px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none"
                  >
                    <option value="">Select a neighborhood</option>
                    {neighborhoods.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}, {n.city}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="pt-4 border-t border-neutral-200">
                <div className="bg-neutral-50 p-4 mb-4">
                  <p className="text-sm text-neutral-600">
                    <strong>Review Process:</strong> All ads are reviewed before going live to ensure they meet our community guidelines. You&apos;ll receive an email once approved (within 24 hours, usually much more quickly), then you can complete payment.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-black text-white py-3 text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Submitting...' : 'Submit for Review'}
                </button>
              </div>
            </form>
          </div>

          {/* Live Preview */}
          <div>
            <p className="text-xs tracking-widest uppercase text-neutral-400 mb-4">
              Live Preview
            </p>
            <div className="bg-neutral-100 p-4 rounded sticky top-24">
              <p className="text-xs text-neutral-400 mb-3 text-center">
                How your ad will appear in the feed
              </p>
              <div className="space-y-3 max-w-sm mx-auto">
                <MockArticleCard {...mockArticles[0]} />

                <div className="relative">
                  <AdPreviewCard headline={formData.headline} imageUrl={formData.imageUrl} />
                  <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-8 bg-black rounded"></div>
                </div>

                <MockArticleCard {...mockArticles[1]} />
              </div>
              <p className="text-xs text-neutral-400 mt-4 text-center">
                {formData.isGlobal
                  ? 'Shown in all neighborhoods'
                  : selectedNeighborhood
                    ? `Shown in ${selectedNeighborhood.name}, ${selectedNeighborhood.city}`
                    : 'Select a neighborhood to target'
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
