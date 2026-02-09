'use client';

import { useState, useEffect } from 'react';

const CRON_SECRET_KEY = 'flaneur_cron_secret';

export default function GenerateContentPage() {
  const [cronSecret, setCronSecret] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);

  // Load cron secret from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(CRON_SECRET_KEY);
    if (saved) setCronSecret(saved);
  }, []);

  // Save cron secret to localStorage when it changes
  const handleCronSecretChange = (value: string) => {
    setCronSecret(value);
    localStorage.setItem(CRON_SECRET_KEY, value);
  };

  const addResult = (action: string, data: any) => {
    setResults(prev => [...prev, { action, data, timestamp: new Date().toISOString() }]);
  };

  const scrapeNews = async () => {
    if (!cronSecret) {
      alert('Please enter the cron secret');
      return;
    }
    setLoading('scrape');
    try {
      const response = await fetch(`https://flaneur-azure.vercel.app/api/scrape-news?secret=${cronSecret}`);
      const data = await response.json();
      addResult('Scrape News', data);
    } catch (error) {
      addResult('Scrape News', { error: String(error) });
    }
    setLoading(null);
  };

  const processQueue = async () => {
    if (!cronSecret) {
      alert('Please enter the cron secret');
      return;
    }
    setLoading('process');
    try {
      const response = await fetch(`https://flaneur-azure.vercel.app/api/process-queue?secret=${cronSecret}`);
      const data = await response.json();
      addResult('Process Queue', data);
    } catch (error) {
      addResult('Process Queue', { error: String(error) });
    }
    setLoading(null);
  };

  const processMultiple = async (times: number) => {
    if (!cronSecret) {
      alert('Please enter the cron secret');
      return;
    }
    setLoading('batch');
    for (let i = 0; i < times; i++) {
      try {
        addResult(`Batch ${i + 1}/${times}`, { status: 'starting...' });
        const response = await fetch(`https://flaneur-azure.vercel.app/api/process-queue?secret=${cronSecret}`);
        const data = await response.json();
        addResult(`Batch ${i + 1}/${times}`, data);
        // Wait 30 seconds between batches
        if (i < times - 1) {
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      } catch (error) {
        addResult(`Batch ${i + 1}/${times}`, { error: String(error) });
      }
    }
    setLoading(null);
  };

  return (
    <div className="min-h-screen bg-canvas py-12">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-2xl font-bold mb-2">Generate Content</h1>
        <p className="text-neutral-400 mb-8">
          Manually trigger the news scraper and article generator.
        </p>

        <div className="bg-surface rounded-lg border border-white/[0.08] p-6 space-y-6">
          {/* Cron Secret */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Cron Secret
            </label>
            <input
              type="password"
              value={cronSecret}
              onChange={(e) => handleCronSecretChange(e.target.value)}
              placeholder="Enter cron secret"
              className="w-full px-3 py-2 border border-white/[0.08] bg-surface rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          {/* Actions */}
          <div className="space-y-4">
            <div className="p-4 bg-canvas rounded-lg">
              <h3 className="font-medium mb-2">Step 1: Scrape News</h3>
              <p className="text-sm text-neutral-400 mb-3">
                Fetches fresh news from RSS feeds for all neighborhoods.
              </p>
              <button
                onClick={scrapeNews}
                disabled={loading !== null}
                className="bg-neutral-900 text-white px-4 py-2 rounded-md hover:bg-neutral-800 disabled:opacity-50"
              >
                {loading === 'scrape' ? 'Scraping...' : 'Scrape News'}
              </button>
            </div>

            <div className="p-4 bg-canvas rounded-lg">
              <h3 className="font-medium mb-2">Step 2: Generate Articles</h3>
              <p className="text-sm text-neutral-400 mb-3">
                Processes the queue to generate articles with AI (includes images).
              </p>
              <div className="flex gap-2">
                <button
                  onClick={processQueue}
                  disabled={loading !== null}
                  className="bg-neutral-900 text-white px-4 py-2 rounded-md hover:bg-neutral-800 disabled:opacity-50"
                >
                  {loading === 'process' ? 'Processing...' : 'Process Once'}
                </button>
                <button
                  onClick={() => processMultiple(5)}
                  disabled={loading !== null}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading === 'batch' ? 'Running Batch...' : 'Run 5 Batches'}
                </button>
              </div>
              {loading === 'batch' && (
                <p className="text-sm text-amber-600 mt-2">
                  Running batches with 30s delay between each. Please wait...
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-medium mb-4">Results</h2>
            <div className="space-y-3">
              {results.slice().reverse().map((result, i) => (
                <div key={i} className="bg-surface rounded-lg border border-white/[0.08] p-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium">{result.action}</span>
                    <span className="text-xs text-neutral-500">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="text-xs bg-canvas p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
