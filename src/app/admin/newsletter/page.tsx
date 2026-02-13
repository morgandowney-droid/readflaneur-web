'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Subscriber {
  id: string;
  email: string;
  subscribed_at: string;
}

export default function AdminNewsletterPage() {
  const router = useRouter();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSubscribers() {
      try {
        const response = await fetch('/api/admin/newsletter');
        const data = await response.json();

        if (response.status === 401) {
          router.push('/login?redirect=/admin/newsletter');
          return;
        }

        if (response.status === 403) {
          router.push('/');
          return;
        }

        setSubscribers(data.subscribers || []);
        setLoading(false);
      } catch (err) {
        console.error('Error loading subscribers:', err);
        router.push('/login?redirect=/admin/newsletter');
      }
    }

    loadSubscribers();
  }, [router]);

  const exportCSV = () => {
    const csv = [
      'Email,Subscribed At',
      ...subscribers.map(s => `${s.email},${s.subscribed_at}`)
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `newsletter-subscribers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="py-12 px-4">
        <div className="mx-auto max-w-4xl">
          <p className="text-fg-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-light">Newsletter Subscribers</h1>
            <p className="text-fg-subtle mt-1">
              {subscribers.length} subscriber{subscribers.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={exportCSV}
              disabled={subscribers.length === 0}
              className="bg-black text-white px-4 py-2 text-sm tracking-widest uppercase hover:bg-elevated transition-colors disabled:opacity-50"
            >
              Export CSV
            </button>
            <Link
              href="/admin/ads"
              className="text-sm text-fg-subtle hover:text-fg"
            >
              &larr; Back to Admin
            </Link>
          </div>
        </div>

        {/* Subscribers Table */}
        <div className="bg-surface border border-border">
          {subscribers.length === 0 ? (
            <p className="p-8 text-center text-fg-muted">
              No subscribers yet.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-xs tracking-widest uppercase text-fg-muted font-normal">
                    Email
                  </th>
                  <th className="text-right p-4 text-xs tracking-widest uppercase text-fg-muted font-normal">
                    Subscribed
                  </th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((subscriber) => (
                  <tr key={subscriber.id} className="border-b border-white/[0.06] last:border-0">
                    <td className="p-4">{subscriber.email}</td>
                    <td className="p-4 text-right text-fg-muted">
                      {new Date(subscriber.subscribed_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
