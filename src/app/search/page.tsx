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
    <div className="py-12 px-4">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-light mb-8">Search</h1>

        {/* Search Form */}
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search articles..."
              className="flex-1 px-4 py-3 border border-neutral-300 focus:border-black focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || query.trim().length < 2}
              className="px-6 py-3 bg-neutral-900 text-white text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:bg-neutral-400 disabled:cursor-not-allowed"
            >
              {loading ? '...' : 'Search'}
            </button>
          </div>
          {query.length > 0 && query.length < 2 && (
            <p className="text-xs text-neutral-400 mt-2">Enter at least 2 characters</p>
          )}
        </form>

        {/* Results */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-neutral-400">Searching...</p>
          </div>
        ) : searched ? (
          results.length > 0 ? (
            <div>
              <p className="text-sm text-neutral-400 mb-6">
                {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{initialQuery}&rdquo;
              </p>

              <div className="space-y-6">
                {results.map((result) => (
                  <Link
                    key={result.id}
                    href={result.url}
                    className="group block border border-neutral-200 hover:border-black transition-colors"
                  >
                    <div className="flex gap-4">
                      {/* Thumbnail */}
                      <div className="relative w-32 h-24 flex-shrink-0">
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
                        <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
                          {result.neighborhood && (
                            <>
                              <span>{result.neighborhood}</span>
                              <span>&middot;</span>
                            </>
                          )}
                          <span>
                            {formatDistanceToNow(new Date(result.published_at), { addSuffix: true })}
                          </span>
                        </div>

                        <h2 className="font-medium group-hover:underline line-clamp-2 mb-1">
                          {result.headline}
                        </h2>

                        <p className="text-sm text-neutral-500 line-clamp-2">
                          {result.excerpt}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 bg-neutral-50">
              <p className="text-neutral-500 mb-2">No results found for &ldquo;{initialQuery}&rdquo;</p>
              <p className="text-sm text-neutral-400">Try different keywords or check your spelling</p>
            </div>
          )
        ) : (
          <div className="text-center py-16">
            <div className="w-12 h-12 mx-auto mb-4 text-neutral-200">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-neutral-500">Enter a search term to find articles</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchLoading() {
  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-light mb-8">Search</h1>
        <div className="h-12 bg-neutral-100 animate-pulse mb-8" />
        <div className="text-center py-12">
          <p className="text-neutral-400">Loading...</p>
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
