'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';

function FooterEmailCapture() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      const subscribed = localStorage.getItem('flaneur-newsletter-subscribed');
      setHidden(subscribed === 'true');
    } catch {
      setHidden(false);
    }
  }, []);

  if (hidden) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || status === 'submitting') return;

    setStatus('submitting');
    try {
      const storedIds = localStorage.getItem('flaneur-neighborhood-preferences');
      const neighborhoodIds = storedIds ? JSON.parse(storedIds) : [];

      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, neighborhoodIds }),
      });

      if (res.ok) {
        setStatus('success');
        localStorage.setItem('flaneur-newsletter-subscribed', 'true');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="border-t border-border py-12 text-center">
        <p className="text-xs tracking-[0.25em] uppercase text-fg-subtle">Thank you</p>
      </div>
    );
  }

  return (
    <div className="border-t border-border py-12">
      <div className="mx-auto max-w-md text-center">
        <p className="text-xs tracking-[0.25em] uppercase text-fg-subtle mb-2">
          BE IN THE KNOW
        </p>
        <p className="text-sm text-fg-subtle mb-6">
          Neighborhood stories, delivered at 7 am
        </p>
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            className="flex-1 bg-transparent border-b border-border text-fg text-sm py-2 px-0 placeholder:text-fg-subtle/50 focus:outline-none focus:border-fg transition-colors"
          />
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="bg-fg text-canvas uppercase tracking-wider text-xs py-2 px-6 hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {status === 'submitting' ? '...' : 'SUBSCRIBE'}
          </button>
        </form>
        {status === 'error' && (
          <p className="text-xs text-red-400 mt-2">Something went wrong. Please try again.</p>
        )}
      </div>
    </div>
  );
}

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-border bg-canvas py-12 md:py-16">
      <div className="mx-auto max-w-5xl px-6 text-center">
        {/* Quiet email capture */}
        <FooterEmailCapture />

        {/* Logo */}
        <div className="mb-10">
          <Link href="/discover" className="font-display text-2xl tracking-[0.35em] font-light text-fg hover:opacity-70 transition-opacity">
            FLANEUR
          </Link>
        </div>

        {/* Navigation */}
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 mb-10">
          <Link href="/about" className="text-sm text-fg-muted hover:text-fg transition-colors">
            {t('footer.about')}
          </Link>
          <Link href="/partner" className="text-sm text-fg-muted hover:text-fg transition-colors">
            Partner
          </Link>
          <Link href="/careers" className="text-sm text-fg-muted hover:text-fg transition-colors">
            {t('footer.careers')}
          </Link>
          <Link href="/contact" className="text-sm text-fg-muted hover:text-fg transition-colors">
            {t('footer.contact')}
          </Link>
          <Link href="/legal" className="text-sm text-fg-muted hover:text-fg transition-colors">
            {t('footer.legal')}
          </Link>
          <Link href="/standards" className="text-sm text-fg-muted hover:text-fg transition-colors">
            {t('footer.standards')}
          </Link>
        </div>

        {/* Copyright */}
        <div className="pt-8 border-t border-border">
          <p className="text-[11px] tracking-[0.15em] text-fg-muted">
            &copy; {new Date().getFullYear()} Flaneur. {t('footer.rights')}
          </p>
        </div>
      </div>
    </footer>
  );
}
