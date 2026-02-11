'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface Neighborhood {
  id: string;
  name: string;
  city: string;
}

export default function AdminEditArticlePage() {
  const router = useRouter();
  const params = useParams();
  const articleId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    headline: '',
    previewText: '',
    bodyText: '',
    images: [] as string[],
    neighborhoodId: '',
    status: 'draft' as string,
    scheduledFor: '',
  });

  useEffect(() => {
    async function loadArticle() {
      try {
        const response = await fetch(`/api/admin/articles/${articleId}`);
        const data = await response.json();

        if (response.status === 401) {
          router.push('/login?redirect=/admin/articles');
          return;
        }

        if (response.status === 403 || response.status === 404) {
          router.push('/admin/articles');
          return;
        }

        const article = data.article;
        setFormData({
          headline: article.headline || '',
          previewText: article.preview_text || '',
          bodyText: article.body_text || '',
          images: article.images || [article.image_url].filter(Boolean),
          neighborhoodId: article.neighborhood_id || '',
          status: article.status || 'draft',
          scheduledFor: article.scheduled_for
            ? new Date(article.scheduled_for).toISOString().slice(0, 16)
            : '',
        });

        setNeighborhoods(data.neighborhoods || []);
        setLoading(false);
      } catch (err) {
        console.error('Error loading article:', err);
        router.push('/admin/articles');
      }
    }

    loadArticle();
  }, [articleId, router]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

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

  const handleSave = async (newStatus?: string) => {
    setError(null);
    setSaving(true);

    try {
      const response = await fetch(`/api/admin/articles/${articleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: formData.headline,
          preview_text: formData.previewText,
          body_text: formData.bodyText,
          images: formData.images,
          image_url: formData.images[0] || '',
          neighborhood_id: formData.neighborhoodId,
          status: newStatus || formData.status,
          scheduled_for: formData.scheduledFor || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save');
      }

      router.push('/admin/articles');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
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

  if (loading) {
    return (
      <div className="py-12 px-4">
        <div className="mx-auto max-w-3xl">
          <p className="text-neutral-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-light">Edit Article</h1>
          <Link
            href="/admin/articles"
            className="text-sm text-neutral-500 hover:text-white"
          >
            &larr; Back to Articles
          </Link>
        </div>

        {/* Status Badge */}
        <div className="mb-6">
          <span
            className={`inline-block px-3 py-1 text-xs tracking-widest uppercase ${
              formData.status === 'published'
                ? 'bg-green-500/15 text-green-400'
                : formData.status === 'pending'
                  ? 'bg-yellow-500/15 text-yellow-400'
                  : formData.status === 'suspended'
                    ? 'bg-orange-500/15 text-orange-400'
                    : formData.status === 'scheduled'
                      ? 'bg-blue-500/15 text-blue-400'
                      : 'bg-neutral-800 text-neutral-400'
            }`}
          >
            {formData.status}
          </span>
        </div>

        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-900/20 border border-red-800/30 mb-6">
            {error}
          </div>
        )}

        <div className="space-y-8">
          {/* Neighborhood */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Neighborhood
            </label>
            <select
              value={formData.neighborhoodId}
              onChange={(e) => setFormData({ ...formData, neighborhoodId: e.target.value })}
              className="w-full px-4 py-3 border border-white/[0.08] focus:border-amber-500 focus:outline-none bg-surface"
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
            <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Headline
            </label>
            <input
              type="text"
              value={formData.headline}
              onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
              maxLength={150}
              className="w-full px-4 py-3 border border-white/[0.08] focus:border-amber-500 focus:outline-none text-lg"
            />
            <p className="text-xs text-neutral-400 mt-1">
              {formData.headline.length}/150 characters
            </p>
          </div>

          {/* Preview Text */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Preview Text
            </label>
            <textarea
              value={formData.previewText}
              onChange={(e) => setFormData({ ...formData, previewText: e.target.value })}
              rows={2}
              maxLength={200}
              className="w-full px-4 py-3 border border-white/[0.08] focus:border-amber-500 focus:outline-none resize-none"
              placeholder="1-2 sentences shown on hover..."
            />
            <p className="text-xs text-neutral-400 mt-1">
              {formData.previewText.length}/200 characters
            </p>
          </div>

          {/* Images */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Photos (1-5 images)
            </label>

            {formData.images.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                {formData.images.map((url, index) => (
                  <div key={index} className="relative aspect-video bg-neutral-800">
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
                          className="bg-surface/90 hover:bg-surface p-1 text-xs"
                        >
                          &larr;
                        </button>
                      )}
                      {index < formData.images.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveImage(index, 'down')}
                          className="bg-surface/90 hover:bg-surface p-1 text-xs"
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
                  className={`inline-block border border-white/[0.08] px-6 py-3 text-sm tracking-widest uppercase cursor-pointer hover:border-white/20 transition-colors ${
                    uploadingImage ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {uploadingImage ? 'Uploading...' : 'Add Photos'}
                </label>
              </div>
            )}
          </div>

          {/* Article Body */}
          <div>
            <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Article Body
            </label>
            <textarea
              value={formData.bodyText}
              onChange={(e) => setFormData({ ...formData, bodyText: e.target.value })}
              rows={14}
              className="w-full px-4 py-3 border border-white/[0.08] focus:border-amber-500 focus:outline-none resize-none font-serif"
            />
            <div className="flex justify-between mt-1">
              <p className="text-xs text-neutral-400">
                Use blank lines to separate paragraphs
              </p>
              <p className={`text-xs ${getWordCountColor()}`}>
                {wordCount} words
              </p>
            </div>
          </div>

          {/* Scheduling */}
          <div className="bg-blue-900/20 border border-blue-800/30 p-4">
            <label className="block text-xs tracking-widest uppercase text-blue-800 mb-2">
              Schedule Publication
            </label>
            <input
              type="datetime-local"
              value={formData.scheduledFor}
              onChange={(e) => setFormData({ ...formData, scheduledFor: e.target.value })}
              className="w-full px-4 py-3 border border-blue-200 focus:border-blue-500 focus:outline-none bg-surface"
            />
            <p className="text-xs text-blue-600 mt-2">
              Leave empty to publish immediately, or set a future date/time to schedule.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-white/[0.08] space-y-4">
            <div className="flex gap-4">
              <button
                onClick={() => handleSave()}
                disabled={saving || uploadingImage}
                className="flex-1 border border-white/[0.08] py-3 text-sm tracking-widest uppercase hover:bg-white/10 text-neutral-100 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              {formData.scheduledFor ? (
                <button
                  onClick={() => handleSave('scheduled')}
                  disabled={saving || uploadingImage}
                  className="flex-1 bg-blue-600 text-white py-3 text-sm tracking-widest uppercase hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Scheduling...' : 'Schedule'}
                </button>
              ) : (
                <button
                  onClick={() => handleSave('published')}
                  disabled={saving || uploadingImage}
                  className="flex-1 bg-green-600 text-white py-3 text-sm tracking-widest uppercase hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Publishing...' : 'Publish Now'}
                </button>
              )}
            </div>
            {formData.status === 'published' && (
              <button
                onClick={() => handleSave('suspended')}
                disabled={saving || uploadingImage}
                className="w-full bg-orange-500 text-white py-3 text-sm tracking-widest uppercase hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                Suspend Article
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
