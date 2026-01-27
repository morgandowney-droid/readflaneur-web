'use client';

import { useState } from 'react';

const NEIGHBORHOODS = [
  { id: 'nyc-west-village', name: 'West Village, NYC' },
  { id: 'london-notting-hill', name: 'Notting Hill, London' },
  { id: 'sf-pacific-heights', name: 'Pacific Heights, SF' },
  { id: 'stockholm-ostermalm', name: 'Östermalm, Stockholm' },
  { id: 'sydney-paddington', name: 'Paddington, Sydney' },
];

export default function RegenerateImagesPage() {
  const [neighborhood, setNeighborhood] = useState('nyc-west-village');
  const [limit, setLimit] = useState(3);
  const [cronSecret, setCronSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRegenerate = async () => {
    if (!cronSecret) {
      setError('Please enter the cron secret');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('https://flaneur-azure.vercel.app/api/regenerate-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': cronSecret,
        },
        body: JSON.stringify({
          neighborhood_id: neighborhood,
          limit: limit,
          provider: 'gemini',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to regenerate images');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-2xl font-bold mb-2">Regenerate Article Images</h1>
        <p className="text-neutral-600 mb-8">
          Generate AI images for articles based on their content using Google's Imagen model.
        </p>

        <div className="bg-white rounded-lg border border-neutral-200 p-6 space-y-6">
          {/* Cron Secret */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Cron Secret
            </label>
            <input
              type="password"
              value={cronSecret}
              onChange={(e) => setCronSecret(e.target.value)}
              placeholder="Enter cron secret for authentication"
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          {/* Neighborhood */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Neighborhood
            </label>
            <select
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-900"
            >
              {NEIGHBORHOODS.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>

          {/* Limit */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Number of Articles
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Will regenerate images for all articles in this neighborhood
            </p>
          </div>

          {/* Submit */}
          <button
            onClick={handleRegenerate}
            disabled={loading}
            className="w-full bg-neutral-900 text-white py-3 rounded-md font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating Images...' : 'Regenerate Images'}
          </button>

          {loading && (
            <p className="text-sm text-neutral-500 text-center">
              This may take 30-60 seconds per image...
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-medium">Error</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 font-medium mb-2">
              {result.message}
            </p>
            <p className="text-green-600 text-sm mb-4">
              Successful: {result.successful} | Failed: {result.failed}
            </p>

            {result.results?.length > 0 && (
              <div className="space-y-4 mt-4">
                {result.results.map((r: any) => (
                  <div
                    key={r.id}
                    className={`p-3 rounded-md ${
                      r.success ? 'bg-green-100' : 'bg-yellow-100'
                    }`}
                  >
                    <p className="font-medium text-sm">{r.headline}</p>
                    {r.imageUrl && (
                      <div className="mt-2">
                        <img
                          src={r.imageUrl}
                          alt={r.headline}
                          className="w-full max-w-md rounded-md"
                        />
                      </div>
                    )}
                    {r.error && (
                      <p className="text-yellow-700 text-xs mt-1">
                        Fallback used: {r.error}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
