'use client';

import { useState } from 'react';

interface Props {
  agentPartnerId: string;
  neighborhoodId: string;
  neighborhoodName: string;
}

export function AgentSubscribeForm({ agentPartnerId, neighborhoodId, neighborhoodName }: Props) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || submitting) return;

    setSubmitting(true);
    setError('');

    try {
      // Detect timezone
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const res = await fetch('/api/partner/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          agentPartnerId,
          neighborhoodId,
          timezone,
        }),
      });

      if (res.ok) {
        setSubscribed(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Something went wrong');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setSubmitting(false);
  };

  if (subscribed) {
    return (
      <div className="p-6 bg-surface border border-border rounded-lg">
        <p className="font-medium mb-1">You&apos;re in.</p>
        <p className="text-fg-muted text-sm">
          Your first {neighborhoodName} Daily arrives tomorrow morning.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm mx-auto">
      <input
        type="email"
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="bg-surface border border-border rounded-lg px-4 py-3 text-fg text-center placeholder:text-fg-subtle focus:outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={submitting || !email.includes('@')}
        className="bg-fg text-canvas px-6 py-3 text-sm font-medium tracking-wider uppercase rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        {submitting ? 'Subscribing...' : 'Subscribe'}
      </button>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </form>
  );
}
