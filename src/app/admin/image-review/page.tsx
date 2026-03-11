'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

interface Photo {
  neighborhoodId: string;
  neighborhoodName: string;
  city: string;
  country: string;
  category: string;
  photoId: string;
  url: string;
  photographer: string;
}

export default function AdminImageReviewPage() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [removeCount, setRemoveCount] = useState(0);

  const loadPage = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/image-review?page=${p}`);
      if (res.status === 401) {
        router.push('/login?redirect=/admin/image-review');
        return;
      }
      const data = await res.json();
      setPhotos(data.photos || []);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      console.error('Error loading photos:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  async function handleRemove(photo: Photo) {
    setRemoving(photo.photoId);
    try {
      const res = await fetch('/api/admin/image-review', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          neighborhoodId: photo.neighborhoodId,
          photoId: photo.photoId,
          category: photo.category,
        }),
      });
      if (res.ok) {
        setRemoved(prev => new Set(prev).add(photo.photoId));
        setRemoveCount(c => c + 1);
      }
    } catch (err) {
      console.error('Remove error:', err);
    } finally {
      setRemoving(null);
    }
  }

  function goToPage(p: number) {
    if (p < 1 || p > totalPages) return;
    setRemoved(new Set());
    loadPage(p);
    window.scrollTo(0, 0);
  }

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin" className="text-xs text-fg-subtle hover:text-fg-muted mb-2 block">&larr; Admin</Link>
            <h1 className="text-2xl font-display font-light">Image Review</h1>
            <p className="text-sm text-fg-muted mt-1">
              {total.toLocaleString()} photos across all neighborhoods. Review and remove generic or inappropriate images.
            </p>
          </div>
          {removeCount > 0 && (
            <div className="text-sm text-red-400 bg-red-400/10 px-3 py-1.5 rounded-md">
              {removeCount} removed this session
            </div>
          )}
        </div>

        {/* Pagination top */}
        <div className="flex items-center justify-between mb-4 text-sm text-fg-muted">
          <span>Page {page} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1 border border-border rounded-md hover:bg-elevated disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1 border border-border rounded-md hover:bg-elevated disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>

        {/* Photo grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-fg-subtle border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {photos.map((photo) => {
              const isRemoved = removed.has(photo.photoId);
              const isRemoving = removing === photo.photoId;

              return (
                <div
                  key={`${photo.neighborhoodId}-${photo.photoId}`}
                  className={`relative border border-border rounded-lg overflow-hidden transition-opacity ${isRemoved ? 'opacity-20' : ''}`}
                >
                  {/* Image */}
                  <div className="relative aspect-[16/9]">
                    <Image
                      src={photo.url.includes('?') ? photo.url : `${photo.url}?w=800&q=75&fm=webp`}
                      alt={`${photo.neighborhoodName} - ${photo.category}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 50vw"
                      unoptimized
                    />
                  </div>

                  {/* Info bar */}
                  <div className="flex items-center justify-between px-3 py-2 bg-surface">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {photo.neighborhoodName}
                        <span className="text-fg-subtle font-normal"> - {photo.city}, {photo.country}</span>
                      </div>
                      <div className="text-xs text-fg-subtle">
                        {photo.category} - by {photo.photographer}
                      </div>
                    </div>

                    {/* Remove button - no confirmation needed */}
                    {!isRemoved ? (
                      <button
                        onClick={() => handleRemove(photo)}
                        disabled={isRemoving}
                        className="ml-3 shrink-0 px-3 py-1.5 text-xs font-medium bg-red-500/20 text-red-400 rounded-md hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                      >
                        {isRemoving ? 'Removing...' : 'Remove'}
                      </button>
                    ) : (
                      <span className="ml-3 shrink-0 text-xs text-red-400">Removed</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination bottom */}
        {!loading && (
          <div className="flex items-center justify-between mt-6 text-sm text-fg-muted">
            <span>
              Showing {(page - 1) * 10 + 1}-{Math.min(page * 10, total)} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1 border border-border rounded-md hover:bg-elevated disabled:opacity-30 disabled:cursor-not-allowed"
              >
              Prev
              </button>
              {/* Quick page jump */}
              <input
                type="number"
                min={1}
                max={totalPages}
                defaultValue={page}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = parseInt((e.target as HTMLInputElement).value, 10);
                    if (val >= 1 && val <= totalPages) goToPage(val);
                  }
                }}
                className="w-16 px-2 py-1 border border-border rounded-md bg-surface text-center text-sm"
                placeholder="Go to"
              />
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1 border border-border rounded-md hover:bg-elevated disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
