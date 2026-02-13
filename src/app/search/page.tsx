'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';

interface SearchResult {
  id: string;
  headline: string;
  excerpt: string;
  image_url: string;
  url: string;
  neighborhood: string | null;
  city: string | null;
  published_at: string;
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();

      if (res.ok) {
        setResults(data.results || []);
      } else {
        setResults([]);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Search on initial load if query param exists
  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery);
    }
  }, [initialQuery, performSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      performSearch(query.trim());
    }
  };

  return (
    <div className="py-8 md:py-12 px-4">
      <div className="mx-auto max-w-3xl">
        {/* Header with close button */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-light text-fg">Search</h1>
          <button
            onClick={() => router.back()}
            className="p-2 -m-2 text-fg-subtle hover:text-fg transition-colors"
            aria-label="Close search"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search articles..."
              className="flex-1 px-4 py-3 border border-border-strong rounded-lg focus:border-amber-500 focus:outline-none bg-surface text-fg placeholder:text-fg-subtle"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || query.trim().length < 2}
              className="px-6 py-3 bg-fg text-canvas text-sm tracking-widest uppercase rounded-lg hover:opacity-80 transition-colors disabled:bg-fg-subtle disabled:cursor-not-allowed"
            >
              {loading ? '...' : 'Search'}
            </button>
          </div>
          {query.length > 0 && query.length < 2 && (
            <p className="text-xs text-fg-muted mt-2">Enter at least 2 characters</p>
          )}
        </form>

        {/* Results */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-fg-muted">Searching...</p>
          </div>
        ) : searched ? (
          results.length > 0 ? (
            <div>
              <p className="text-sm text-fg-muted mb-6">
                {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{initialQuery}&rdquo;
              </p>

              <div className="space-y-4">
                {results.map((result) => (
                  <Link
                    key={result.id}
                    href={result.url}
                    className="group block border border-border hover:border-border-strong rounded-lg overflow-hidden transition-colors"
                  >
                    <div className="flex gap-4">
                      {/* Thumbnail */}
                      <div className="relative w-28 h-24 md:w-32 flex-shrink-0">
                        <Image
                          src={result.image_url}
                          alt={result.headline}
                          fill
                          className="object-cover"
                          sizes="128px"
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 py-3 pr-4">
                        <div className="flex items-center gap-2 text-xs text-fg-muted mb-1">
                          {result.neighborhood && (
                            <>
                              <span className="uppercase tracking-wide">{result.neighborhood}</span>
                              <span>&middot;</span>
                            </>
                          )}
                          <span>
                            {formatDistanceToNow(new Date(result.published_at), { addSuffix: true })}
                          </span>
                        </div>

                        <h2 className="font-medium text-fg group-hover:underline line-clamp-2 mb-1">
                          {result.headline}
                        </h2>

                        <p className="text-sm text-fg-subtle line-clamp-2 hidden md:block">
                          {result.excerpt}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 bg-surface rounded-lg">
              <p className="text-fg-subtle mb-2">No results found for &ldquo;{initialQuery}&rdquo;</p>
              <p className="text-sm text-fg-muted">Try different keywords or check your spelling</p>
            </div>
          )
        ) : (
          <div className="text-center py-16">
            <div className="w-12 h-12 mx-auto mb-4 text-fg-subtle">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-fg-subtle">Enter a search term to find articles</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchLoading() {
  return (
    <div className="py-8 md:py-12 px-4">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-light text-fg mb-8">Search</h1>
        <div className="h-12 bg-elevated animate-pulse rounded-lg mb-8" />
        <div className="text-center py-12">
          <p className="text-fg-muted">Loading...</p>
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchLoading />}>
      <SearchContent />
    </Suspense>
  );
}
