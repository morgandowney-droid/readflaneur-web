'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Neighborhood } from '@/types';
import { slugify } from '@/lib/utils';

export default function CreateArticlePage() {
  const router = useRouter();
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    headline: '',
    previewText: '',
    bodyText: '',
    images: [] as string[],
    neighborhoodId: '',
  });

  useEffect(() => {
    async function init() {
      const supabase = createClient();

      // Check auth and role
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login?redirect=/journalist/articles/new');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, assigned_neighborhood_id')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'journalist' && profile?.role !== 'admin') {
        router.push('/journalist/apply');
        return;
      }

      setIsAuthorized(true);

      // Fetch neighborhoods
      const { data: neighborhoodsData } = await supabase
        .from('neighborhoods')
        .select('*')
        .order('city', { ascending: true });

      setNeighborhoods(neighborhoodsData || []);

      // Pre-select assigned neighborhood if journalist has one
      if (profile?.assigned_neighborhood_id) {
        setFormData(prev => ({ ...prev, neighborhoodId: profile.assigned_neighborhood_id }));
      }

      setIsLoading(false);
    }

    init();
  }, [router]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Check max images
    if (formData.images.length + files.length > 5) {
      setError('Maximum 5 images allowed per article');
      return;
    }

    setUploadingImage(true);
    setError(null);

    for (const file of Array.from(files)) {
      try {
        const uploadFormData = new FormData();
        uploadFormData.append('file', file);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: uploadFormData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Upload failed');
        }

        setFormData(prev => ({
          ...prev,
          images: [...prev.images, data.url],
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload image');
      }
    }

    setUploadingImage(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const moveImage = (index: number, direction: 'up' | 'down') => {
    const newImages = [...formData.images];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newImages.length) return;
    [newImages[index], newImages[newIndex]] = [newImages[newIndex], newImages[index]];
    setFormData(prev => ({ ...prev, images: newImages }));
  };

  const handleSubmit = async (e: React.FormEvent, asDraft = false) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.neighborhoodId) {
      setError('Please select a neighborhood');
      return;
    }
    if (!formData.headline.trim()) {
      setError('Please enter a headline');
      return;
    }
    if (!formData.previewText.trim()) {
      setError('Please enter preview text');
      return;
    }
    if (!formData.bodyText.trim()) {
      setError('Please enter article body');
      return;
    }
    if (formData.images.length === 0) {
      setError('Please upload at least one image');
      return;
    }

    setIsSubmitting(true);

    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setError('You must be logged in to create an article');
      setIsSubmitting(false);
      return;
    }

    const slug = slugify(formData.headline);

    const { error: insertError } = await supabase.from('articles').insert({
      author_id: user.id,
      headline: formData.headline,
      slug: slug,
      preview_text: formData.previewText,
      body_text: formData.bodyText,
      image_url: formData.images[0], // Primary image
      images: formData.images, // All images as array
      neighborhood_id: formData.neighborhoodId,
      status: asDraft ? 'draft' : 'pending',
    });

    if (insertError) {
      setError(insertError.message);
      setIsSubmitting(false);
      return;
    }

    router.push('/journalist');
  };

  // Word count
  const wordCount = formData.bodyText.trim().split(/\s+/).filter(Boolean).length;
  const getWordCountColor = () => {
    if (wordCount < 100) return 'text-yellow-600';
    if (wordCount > 600) return 'text-yellow-600';
    return 'text-green-600';
  };

  // Group neighborhoods by city
  const neighborhoodsByCity = neighborhoods.reduce((acc, n) => {
    if (!acc[n.city]) acc[n.city] = [];
    acc[n.city].push(n);
    return acc;
  }, {} as Record<string, Neighborhood[]>);

  if (isLoading) {
    return (
      <div className="py-12 px-4">
        <div className="mx-auto max-w-3xl">
          <p className="text-fg-muted">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-light">Write New Article</h1>
          <Link
            href="/journalist"
            className="text-sm text-fg-subtle hover:text-black"
          >
            &larr; Back to Dashboard
          </Link>
        </div>

        {/* Guidelines */}
        <div className="bg-neutral-50 border border-neutral-200 p-4 mb-8">
          <p className="text-sm text-fg-subtle">
            <strong>Guidelines:</strong> Articles should be 100-600 words (ideal: ~300 words).
            Include 1-5 high-quality photos. Focus on speed, wit, and aesthetics.
          </p>
        </div>

        <form className="space-y-8">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200">
              {error}
            </div>
          )}

          {/* Neighborhood */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-fg-muted mb-2">
              Neighborhood *
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

          {/* Headline */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-fg-muted mb-2">
              Headline *
            </label>
            <input
              type="text"
              value={formData.headline}
              onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
              required
              maxLength={150}
              className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none text-lg"
              placeholder="Your compelling headline"
            />
            <p className="text-xs text-fg-muted mt-1">
              {formData.headline.length}/150 characters
            </p>
          </div>

          {/* Preview Text */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-fg-muted mb-2">
              Preview Text *
            </label>
            <textarea
              value={formData.previewText}
              onChange={(e) => setFormData({ ...formData, previewText: e.target.value })}
              required
              rows={2}
              maxLength={200}
              className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none resize-none"
              placeholder="1-2 sentences shown when readers hover over the photo..."
            />
            <p className="text-xs text-fg-muted mt-1">
              This appears when readers hover over the photo or tap on mobile. {formData.previewText.length}/200 characters
            </p>
          </div>

          {/* Images */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-fg-muted mb-2">
              Photos * (1-5 images)
            </label>

            {/* Image Grid */}
            {formData.images.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                {formData.images.map((url, index) => (
                  <div key={index} className="relative aspect-video bg-neutral-100">
                    <img
                      src={url}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {index === 0 && (
                      <span className="absolute top-2 left-2 bg-black text-white text-xs px-2 py-1">
                        Featured
                      </span>
                    )}
                    <div className="absolute top-2 right-2 flex gap-1">
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => moveImage(index, 'up')}
                          className="bg-white/90 hover:bg-white p-1 text-xs"
                        >
                          &larr;
                        </button>
                      )}
                      {index < formData.images.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveImage(index, 'down')}
                          className="bg-white/90 hover:bg-white p-1 text-xs"
                        >
                          &rarr;
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="bg-red-500 hover:bg-red-600 text-white p-1 text-xs"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Button */}
            {formData.images.length < 5 && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                  id="image-upload"
                />
                <label
                  htmlFor="image-upload"
                  className={`inline-block border border-neutral-200 px-6 py-3 text-sm tracking-widest uppercase cursor-pointer hover:border-black transition-colors ${
                    uploadingImage ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {uploadingImage ? 'Uploading...' : `Add Photo${formData.images.length > 0 ? 's' : ''}`}
                </label>
                <p className="text-xs text-fg-muted mt-2">
                  JPEG, PNG, WebP, or HEIC. Max 10MB each. First photo is featured.
                </p>
              </div>
            )}
          </div>

          {/* Article Body */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-fg-muted mb-2">
              Article Body *
            </label>
            <textarea
              value={formData.bodyText}
              onChange={(e) => setFormData({ ...formData, bodyText: e.target.value })}
              required
              rows={14}
              className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none resize-none font-serif"
              placeholder="Write your article here. Use blank lines between paragraphs..."
            />
            <div className="flex justify-between mt-1">
              <p className="text-xs text-fg-muted">
                Use blank lines to separate paragraphs
              </p>
              <p className={`text-xs ${getWordCountColor()}`}>
                {wordCount} words {wordCount < 100 && '(min 100)'} {wordCount > 600 && '(max 600)'}
                {wordCount >= 100 && wordCount <= 600 && '(good)'}
              </p>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="pt-6 border-t border-neutral-200 flex gap-4">
            <button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              disabled={isSubmitting || uploadingImage}
              className="flex-1 border border-black py-3 text-sm tracking-widest uppercase hover:bg-black hover:text-fg transition-colors disabled:opacity-50"
            >
              Save as Draft
            </button>
            <button
              type="button"
              onClick={(e) => handleSubmit(e, false)}
              disabled={isSubmitting || uploadingImage}
              className="flex-1 bg-black text-white py-3 text-sm tracking-widest uppercase hover:bg-elevated transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit for Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
