'use client';

import { useState, useEffect, useRef, use } from 'react';

interface AdInfo {
  id: string;
  status: string;
  neighborhood_name: string;
  city_name: string;
  start_date: string;
  placement_type: string;
}

export default function UploadPage({ params }: { params: Promise<{ adId: string }> }) {
  const { adId } = use(params);
  const [adInfo, setAdInfo] = useState<AdInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form state
  const [sponsorLabel, setSponsorLabel] = useState('');
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [clickUrl, setClickUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch ad info on mount
  useEffect(() => {
    async function fetchAd() {
      try {
        const res = await fetch(`/api/ads/${adId}/info`);
        if (!res.ok) {
          setError(res.status === 404 ? 'Booking not found.' : 'Failed to load booking.');
          return;
        }
        const data = await res.json();
        if (data.status !== 'pending_assets') {
          setError('Creative has already been submitted for this booking.');
          return;
        }
        setAdInfo(data);
      } catch {
        setError('Failed to load booking information.');
      } finally {
        setLoading(false);
      }
    }
    fetchAd();
  }, [adId]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Image must be JPG, PNG, or WebP');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be under 2MB');
      return;
    }

    setError('');
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    if (!imageFile) {
      setError('Please upload an image');
      setSubmitting(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('sponsorLabel', sponsorLabel);
      formData.append('headline', headline);
      formData.append('body', body);
      formData.append('clickUrl', clickUrl);
      formData.append('image', imageFile);

      const res = await fetch(`/api/ads/${adId}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Upload failed');
        setSubmitting(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <p className="text-fg-subtle text-sm">Loading...</p>
      </div>
    );
  }

  if (error && !adInfo) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="font-[family-name:var(--font-cormorant)] text-2xl font-light mb-4">
            {error}
          </h1>
          <p className="text-fg-subtle text-sm">
            If you believe this is an error, contact{' '}
            <a href="mailto:ads@readflaneur.com" className="underline">ads@readflaneur.com</a>
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-xs tracking-[0.3em] uppercase text-fg-subtle mb-4">Creative Submitted</p>
          <h1 className="font-[family-name:var(--font-cormorant)] text-3xl font-light mb-6">
            Your ad is under review
          </h1>
          <p className="text-fg-muted text-sm leading-relaxed mb-8">
            Our editorial team will review your creative and notify you by email when it&apos;s approved.
            This typically takes less than 24 hours.
          </p>
          <a
            href="/advertise"
            className="inline-block bg-white text-black px-8 py-3 text-sm tracking-widest uppercase hover:bg-neutral-200 transition-colors"
          >
            Back to Advertising
          </a>
        </div>
      </div>
    );
  }

  const displayDate = adInfo?.start_date
    ? new Date(adInfo.start_date + 'T00:00:00Z').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';

  const placementLabel = adInfo?.placement_type === 'sunday_edition'
    ? 'Sunday Edition'
    : 'Daily Brief';

  return (
    <div className="min-h-screen bg-neutral-950 text-white -mt-[1px]">
      <div className="max-w-xl mx-auto px-4 py-16">
        {/* Header */}
        <p className="text-xs tracking-[0.3em] uppercase text-fg-subtle mb-4 text-center">
          Upload Creative
        </p>
        <h1 className="font-[family-name:var(--font-cormorant)] text-3xl font-light text-center mb-2">
          {adInfo?.neighborhood_name}{adInfo?.city_name ? `, ${adInfo.city_name}` : ''}
        </h1>
        <p className="text-fg-subtle text-sm text-center mb-10">
          {placementLabel} &mdash; {displayDate}
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Brand Name */}
          <div>
            <label className="block text-xs tracking-[0.2em] uppercase text-fg-subtle mb-2">
              Brand Name
            </label>
            <input
              type="text"
              value={sponsorLabel}
              onChange={(e) => setSponsorLabel(e.target.value)}
              placeholder="Your company or brand name"
              required
              className="w-full bg-surface border border-neutral-700 px-4 py-3 text-sm text-white placeholder-fg-subtle focus:border-neutral-500 focus:outline-none"
            />
          </div>

          {/* Headline */}
          <div>
            <label className="block text-xs tracking-[0.2em] uppercase text-fg-subtle mb-2">
              Headline <span className="text-neutral-600">({60 - headline.length} chars remaining)</span>
            </label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value.slice(0, 60))}
              placeholder="Short, compelling headline"
              required
              maxLength={60}
              className="w-full bg-surface border border-neutral-700 px-4 py-3 text-sm text-white placeholder-fg-subtle focus:border-neutral-500 focus:outline-none"
            />
          </div>

          {/* Body Copy */}
          <div>
            <label className="block text-xs tracking-[0.2em] uppercase text-fg-subtle mb-2">
              Body Copy <span className="text-neutral-600">(optional, {150 - body.length} chars remaining)</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 150))}
              placeholder="Optional supporting text"
              maxLength={150}
              rows={2}
              className="w-full bg-surface border border-neutral-700 px-4 py-3 text-sm text-white placeholder-fg-subtle focus:border-neutral-500 focus:outline-none resize-none"
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-xs tracking-[0.2em] uppercase text-fg-subtle mb-2">
              Ad Image <span className="text-neutral-600">(JPG, PNG, or WebP, max 2MB)</span>
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed ${
                imagePreview ? 'border-neutral-600' : 'border-neutral-700'
              } bg-surface p-8 text-center cursor-pointer hover:border-neutral-500 transition-colors`}
            >
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="max-h-48 mx-auto object-contain"
                />
              ) : (
                <div>
                  <p className="text-fg-muted text-sm mb-1">Drop your image here or click to browse</p>
                  <p className="text-neutral-600 text-xs">Recommended: 600x400px or larger</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange}
              className="hidden"
            />
            {imageFile && (
              <p className="text-xs text-fg-subtle mt-2">
                {imageFile.name} ({(imageFile.size / 1024).toFixed(0)} KB)
              </p>
            )}
          </div>

          {/* Click URL */}
          <div>
            <label className="block text-xs tracking-[0.2em] uppercase text-fg-subtle mb-2">
              Click URL
            </label>
            <input
              type="url"
              value={clickUrl}
              onChange={(e) => setClickUrl(e.target.value)}
              placeholder="https://yourbrand.com/landing-page"
              required
              className="w-full bg-surface border border-neutral-700 px-4 py-3 text-sm text-white placeholder-fg-subtle focus:border-neutral-500 focus:outline-none"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-white text-black py-3 text-sm tracking-widest uppercase hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Uploading...' : 'Submit Creative'}
          </button>

          <p className="text-xs text-neutral-600 text-center leading-relaxed">
            Our editorial team may refine your copy to match the Fl&acirc;neur voice.
            You&apos;ll receive a proof for approval before your ad goes live.
          </p>
        </form>
      </div>
    </div>
  );
}
