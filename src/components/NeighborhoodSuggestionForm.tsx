'use client';

import { useState } from 'react';

interface NeighborhoodSuggestionFormProps {
  variant: 'compact' | 'full';
}

export function NeighborhoodSuggestionForm({ variant }: NeighborhoodSuggestionFormProps) {
  const [suggestion, setSuggestion] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suggestion.trim() || suggestion.trim().length < 3) return;

    setStatus('submitting');

    try {
      const res = await fetch('/api/suggestions/neighborhood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestion: suggestion.trim(),
          email: email.trim() || undefined,
        }),
      });

      if (res.ok) {
        setStatus('success');
        setSuggestion('');
        setEmail('');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className={variant === 'compact' ? 'py-2' : 'py-4'}>
        <p className="text-sm text-fg-muted">Thanks for your suggestion! We review every submission.</p>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <form onSubmit={handleSubmit} className="mt-3 space-y-2">
        <input
          type="text"
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
          placeholder="e.g. Williamsburg, Brooklyn"
          maxLength={200}
          className="w-full px-3 py-2 border border-border bg-transparent focus:border-white/30 focus:outline-none text-sm text-white placeholder:text-fg-subtle"
          disabled={status === 'submitting'}
        />
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="flex-1 px-3 py-2 border border-border bg-transparent focus:border-white/30 focus:outline-none text-sm text-white placeholder:text-fg-subtle"
            disabled={status === 'submitting'}
          />
          <button
            type="submit"
            disabled={status === 'submitting' || suggestion.trim().length < 3}
            className="bg-fg text-canvas px-5 py-2 text-xs tracking-widest uppercase hover:opacity-80 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {status === 'submitting' ? '...' : 'Submit'}
          </button>
        </div>
        {status === 'error' && (
          <p className="text-xs text-red-400">Something went wrong. Please try again.</p>
        )}
      </form>
    );
  }

  // Full variant (contact page)
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="suggestion" className="block text-sm text-fg-muted mb-1">
          Neighborhood and city
        </label>
        <input
          id="suggestion"
          type="text"
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
          placeholder="e.g. Williamsburg, Brooklyn"
          maxLength={200}
          className="w-full px-4 py-3 bg-surface border border-border-strong text-white focus:border-amber-500 focus:outline-none text-sm placeholder:text-fg-subtle"
          disabled={status === 'submitting'}
        />
      </div>
      <div>
        <label htmlFor="suggest-email" className="block text-sm text-fg-muted mb-1">
          Your email (optional - we&apos;ll notify you if we add it)
        </label>
        <input
          id="suggest-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="w-full px-4 py-3 bg-surface border border-border-strong text-white focus:border-amber-500 focus:outline-none text-sm placeholder:text-fg-subtle"
          disabled={status === 'submitting'}
        />
      </div>
      <button
        type="submit"
        disabled={status === 'submitting' || suggestion.trim().length < 3}
        className="bg-fg text-canvas px-6 py-3 text-sm tracking-widest uppercase hover:opacity-80 transition-colors disabled:opacity-50"
      >
        {status === 'submitting' ? 'Submitting...' : 'Submit Suggestion'}
      </button>
      {status === 'error' && (
        <p className="text-sm text-red-400">Something went wrong. Please try again.</p>
      )}
    </form>
  );
}
