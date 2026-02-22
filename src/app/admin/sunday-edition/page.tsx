'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const CRON_SECRET_KEY = 'flaneur_cron_secret';

interface Neighborhood {
  id: string;
  name: string;
  city: string;
}

interface StatusInfo {
  briefExists: boolean;
  briefWeekDate: string | null;
  articleExists: boolean;
  articleUrl: string | null;
  articleSlug: string | null;
}

interface LogEntry {
  action: string;
  data: unknown;
  timestamp: string;
}

export default function SundayEditionAdminPage() {
  const [cronSecret, setCronSecret] = useState('');
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [adminEmail, setAdminEmail] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);

  // Load persisted values
  useEffect(() => {
    const saved = localStorage.getItem(CRON_SECRET_KEY);
    if (saved) setCronSecret(saved);

    const savedEmail = localStorage.getItem('flaneur_admin_email');
    if (savedEmail) setAdminEmail(savedEmail);
  }, []);

  // Fetch neighborhoods
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    supabase
      .from('neighborhoods')
      .select('id, name, city')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data) setNeighborhoods(data);
      }, () => {});
  }, []);

  const handleCronSecretChange = (value: string) => {
    setCronSecret(value);
    localStorage.setItem(CRON_SECRET_KEY, value);
  };

  const handleEmailChange = (value: string) => {
    setAdminEmail(value);
    localStorage.setItem('flaneur_admin_email', value);
  };

  const addResult = (action: string, data: unknown) => {
    setResults(prev => [...prev, { action, data, timestamp: new Date().toISOString() }]);
  };

  // Check status when neighborhood or date changes
  const checkStatus = useCallback(async () => {
    if (!selectedId || !date) {
      setStatus(null);
      return;
    }
    setStatusLoading(true);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      // Check weekly_briefs
      const { data: brief } = await supabase
        .from('weekly_briefs')
        .select('week_date, article_id')
        .eq('neighborhood_id', selectedId)
        .eq('week_date', date)
        .single();

      // Check for article
      const slug = `${selectedId}-sunday-edition-${date}`;
      const { data: article } = await supabase
        .from('articles')
        .select('id, slug, status')
        .eq('slug', slug)
        .eq('status', 'published')
        .single();

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';
      const hood = neighborhoods.find(n => n.id === selectedId);
      let articleUrl: string | null = null;
      if (article && hood) {
        const neighborhoodSlug = selectedId.split('-').slice(1).join('-');
        const citySlug = hood.city.toLowerCase().replace(/\s+/g, '-');
        articleUrl = `${appUrl}/${citySlug}/${neighborhoodSlug}/${article.slug}`;
      }

      setStatus({
        briefExists: !!brief,
        briefWeekDate: brief?.week_date || null,
        articleExists: !!article,
        articleUrl,
        articleSlug: article?.slug || null,
      });
    } catch {
      setStatus(null);
    }
    setStatusLoading(false);
  }, [selectedId, date, neighborhoods]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const generateBrief = async () => {
    if (!cronSecret) { alert('Enter the cron secret'); return; }
    if (!selectedId) { alert('Select a neighborhood'); return; }
    setLoading('generate');
    try {
      const response = await fetch(
        `/api/cron/sync-weekly-brief?test=${selectedId}&date=${date}`,
        { headers: { Authorization: `Bearer ${cronSecret}` } }
      );
      const data = await response.json();
      addResult('Generate Brief + Article', data);
      // Refresh status
      await checkStatus();
    } catch (error) {
      addResult('Generate Brief + Article', { error: String(error) });
    }
    setLoading(null);
  };

  const previewEmail = async () => {
    if (!cronSecret) { alert('Enter the cron secret'); return; }
    if (!selectedId) { alert('Select a neighborhood'); return; }
    setLoading('preview');
    setPreviewHtml(null);
    setPreviewSubject(null);
    try {
      const response = await fetch(
        `/api/admin/preview-sunday-edition?neighborhood=${selectedId}&date=${date}`,
        { headers: { Authorization: `Bearer ${cronSecret}` } }
      );
      const data = await response.json();
      if (data.html) {
        setPreviewHtml(data.html);
        setPreviewSubject(data.subject);
        addResult('Preview Email', {
          subject: data.subject,
          briefWeekDate: data.briefWeekDate,
          articleExists: data.articleExists,
          articleUrl: data.articleUrl,
          warning: data.warning,
        });
      } else {
        addResult('Preview Email', data);
      }
    } catch (error) {
      addResult('Preview Email', { error: String(error) });
    }
    setLoading(null);
  };

  const sendTest = async () => {
    if (!cronSecret) { alert('Enter the cron secret'); return; }
    if (!adminEmail) { alert('Enter your email'); return; }
    setLoading('send');
    try {
      const response = await fetch(
        `/api/cron/send-sunday-edition?test=${encodeURIComponent(adminEmail)}&force=true`,
        { headers: { Authorization: `Bearer ${cronSecret}` } }
      );
      const data = await response.json();
      addResult('Send Test Email', data);
    } catch (error) {
      addResult('Send Test Email', { error: String(error) });
    }
    setLoading(null);
  };

  return (
    <div className="min-h-screen bg-canvas py-12">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-2xl font-bold mb-2">Sunday Edition Admin</h1>
        <p className="text-fg-muted mb-8">
          Generate, preview, and test-send Sunday Edition emails for any neighborhood on any day.
        </p>

        <div className="bg-surface rounded-lg border border-border p-6 space-y-6">
          {/* Cron Secret */}
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-2">
              Cron Secret
            </label>
            <input
              type="password"
              value={cronSecret}
              onChange={(e) => handleCronSecretChange(e.target.value)}
              placeholder="Enter cron secret"
              className="w-full px-3 py-2 border border-border bg-surface rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          {/* Neighborhood selector */}
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-2">
              Neighborhood
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full px-3 py-2 border border-border bg-surface rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-900"
            >
              <option value="">Select a neighborhood...</option>
              {neighborhoods.map(n => (
                <option key={n.id} value={n.id}>
                  {n.name} - {n.city}
                </option>
              ))}
            </select>
          </div>

          {/* Date input */}
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-2">
              Week Date (YYYY-MM-DD)
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-border bg-surface rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          {/* Admin email */}
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-2">
              Admin Email (for test sends)
            </label>
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-3 py-2 border border-border bg-surface rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          {/* Status check */}
          {selectedId && (
            <div className="p-4 bg-canvas rounded-lg">
              <h3 className="font-medium mb-2">Status</h3>
              {statusLoading ? (
                <p className="text-sm text-fg-muted">Checking...</p>
              ) : status ? (
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={status.briefExists ? 'text-green-500' : 'text-red-400'}>
                      {status.briefExists ? '\u2713' : '\u2717'}
                    </span>
                    <span className="text-fg-muted">
                      Weekly brief {status.briefExists ? `exists (${status.briefWeekDate})` : `not found for ${date}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={status.articleExists ? 'text-green-500' : 'text-red-400'}>
                      {status.articleExists ? '\u2713' : '\u2717'}
                    </span>
                    <span className="text-fg-muted">
                      Feed article {status.articleExists ? 'published' : 'not found'}
                    </span>
                  </div>
                  {status.articleUrl && (
                    <div className="ml-6">
                      <a
                        href={status.articleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline text-xs"
                      >
                        {status.articleUrl}
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-fg-muted">Select a neighborhood and date</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-4">
            <div className="p-4 bg-canvas rounded-lg">
              <h3 className="font-medium mb-2">1. Generate Brief + Article</h3>
              <p className="text-sm text-fg-muted mb-3">
                Calls sync-weekly-brief cron for this neighborhood. Creates the weekly_brief record and feed article.
              </p>
              <button
                onClick={generateBrief}
                disabled={loading !== null}
                className="bg-surface text-fg px-4 py-2 rounded-md hover:bg-elevated disabled:opacity-50 border border-border"
              >
                {loading === 'generate' ? 'Generating...' : 'Generate Brief + Article'}
              </button>
            </div>

            <div className="p-4 bg-canvas rounded-lg">
              <h3 className="font-medium mb-2">2. Preview Email</h3>
              <p className="text-sm text-fg-muted mb-3">
                Renders the Sunday Edition email HTML. Shows the subject line and full email in an iframe.
              </p>
              <button
                onClick={previewEmail}
                disabled={loading !== null}
                className="bg-surface text-fg px-4 py-2 rounded-md hover:bg-elevated disabled:opacity-50 border border-border"
              >
                {loading === 'preview' ? 'Loading Preview...' : 'Preview Email'}
              </button>
            </div>

            <div className="p-4 bg-canvas rounded-lg">
              <h3 className="font-medium mb-2">3. Send Test to Me</h3>
              <p className="text-sm text-fg-muted mb-3">
                Sends the Sunday Edition to the admin email above. Uses the most recent brief for your primary neighborhood.
              </p>
              <button
                onClick={sendTest}
                disabled={loading !== null}
                className="bg-surface text-fg px-4 py-2 rounded-md hover:bg-elevated disabled:opacity-50 border border-border"
              >
                {loading === 'send' ? 'Sending...' : 'Send Test to Me'}
              </button>
            </div>
          </div>
        </div>

        {/* Email Preview */}
        {previewHtml && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Email Preview</h2>
              <button
                onClick={() => { setPreviewHtml(null); setPreviewSubject(null); }}
                className="text-sm text-fg-muted hover:text-fg"
              >
                Close
              </button>
            </div>
            {previewSubject && (
              <div className="bg-surface rounded-t-lg border border-border border-b-0 px-4 py-3">
                <span className="text-xs text-fg-subtle uppercase tracking-wider">Subject</span>
                <p className="text-sm font-medium mt-1">{previewSubject}</p>
              </div>
            )}
            <div className="border border-border rounded-b-lg overflow-hidden bg-white">
              <iframe
                srcDoc={previewHtml}
                title="Sunday Edition Preview"
                className="w-full border-0"
                style={{ height: '800px' }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        )}

        {/* Results Log */}
        {results.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Results Log</h2>
              <button
                onClick={() => setResults([])}
                className="text-sm text-fg-muted hover:text-fg"
              >
                Clear
              </button>
            </div>
            <div className="space-y-3">
              {results.slice().reverse().map((result, i) => (
                <div key={i} className="bg-surface rounded-lg border border-border p-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium">{result.action}</span>
                    <span className="text-xs text-fg-subtle">
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
