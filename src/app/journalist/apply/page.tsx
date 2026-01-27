'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Neighborhood {
  id: string;
  name: string;
  city: string;
}

export default function JournalistApplyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    neighborhoodId: '',
    zipCode: '',
    phone: '',
    bio: '',
    whyInterested: '',
    photoUrl1: '',
    photoUrl2: '',
  });

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/api/journalist/apply');
        const data = await response.json();

        if (response.status === 401) {
          router.push('/login?redirect=/journalist/apply');
          return;
        }

        if (data.alreadyApplied) {
          setError('You have already submitted an application. We will be in touch soon.');
          setLoading(false);
          return;
        }

        if (data.alreadyApproved) {
          router.push('/journalist');
          return;
        }

        setNeighborhoods(data.neighborhoods || []);
        setLoading(false);
      } catch (err) {
        console.error('Error loading application page:', err);
        router.push('/login?redirect=/journalist/apply');
      }
    }

    loadData();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/journalist/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit application');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    }

    setSubmitting(false);
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

  if (success) {
    return (
      <div className="py-12 px-4">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-8">
            <span className="text-4xl">✓</span>
          </div>
          <h1 className="text-2xl font-light mb-4">Application Submitted</h1>
          <p className="text-neutral-600 mb-8">
            Thank you for your interest in joining Flâneur. We'll review your application
            and be in touch soon.
          </p>
          <Link
            href="/"
            className="inline-block bg-black text-white px-8 py-3 text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (error && !neighborhoods.length) {
    return (
      <div className="py-12 px-4">
        <div className="mx-auto max-w-2xl">
          <div className="bg-yellow-50 border border-yellow-200 p-6 text-center">
            <p className="text-yellow-800">{error}</p>
          </div>
          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-neutral-500 hover:text-black">
              &larr; Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Group neighborhoods by city
  const neighborhoodsByCity = neighborhoods.reduce((acc, n) => {
    if (!acc[n.city]) acc[n.city] = [];
    acc[n.city].push(n);
    return acc;
  }, {} as Record<string, Neighborhood[]>);

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-light mb-2">Apply to Write for Flâneur</h1>
          <p className="text-neutral-500">
            Become a Neighborhood Editor and share stories from your community.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 p-4 text-red-600 text-sm mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Neighborhood Selection */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Which neighborhood do you want to cover? *
            </label>
            <select
              value={formData.neighborhoodId}
              onChange={(e) => setFormData({ ...formData, neighborhoodId: e.target.value })}
              required
              className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none bg-white"
            >
              <option value="">Select a neighborhood</option>
              {Object.entries(neighborhoodsByCity).map(([city, hoods]) => (
                <optgroup key={city} label={city}>
                  {hoods.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Zip Code */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Your Zip/Postal Code *
            </label>
            <input
              type="text"
              value={formData.zipCode}
              onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
              required
              placeholder="e.g., W11 2BQ"
              className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none"
            />
            <p className="text-xs text-neutral-400 mt-1">
              We verify that editors live in or near their neighborhood.
            </p>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Phone Number *
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
              placeholder="+1 555 123 4567"
              className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none"
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
              About You *
            </label>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              required
              rows={4}
              placeholder="Tell us about yourself in one paragraph..."
              className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none resize-none"
            />
          </div>

          {/* Why Interested */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Why are you interested in this role?
            </label>
            <textarea
              value={formData.whyInterested}
              onChange={(e) => setFormData({ ...formData, whyInterested: e.target.value })}
              rows={3}
              placeholder="What draws you to hyper-local journalism?"
              className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none resize-none"
            />
          </div>

          {/* Photo URLs */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
              The Test: Share 2 Photos of Your Neighborhood *
            </label>
            <p className="text-sm text-neutral-500 mb-4">
              Upload your photos to a service like Google Drive, Dropbox, or iCloud and paste the links below.
              Photos should be taken recently and showcase your neighborhood.
            </p>
            <div className="space-y-3">
              <input
                type="url"
                value={formData.photoUrl1}
                onChange={(e) => setFormData({ ...formData, photoUrl1: e.target.value })}
                required
                placeholder="Photo 1 URL"
                className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none"
              />
              <input
                type="url"
                value={formData.photoUrl2}
                onChange={(e) => setFormData({ ...formData, photoUrl2: e.target.value })}
                required
                placeholder="Photo 2 URL"
                className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-black text-white py-3 text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        </form>

        <div className="mt-8 text-center">
          <Link href="/careers" className="text-sm text-neutral-500 hover:text-black">
            &larr; Back to Job Description
          </Link>
        </div>
      </div>
    </div>
  );
}
