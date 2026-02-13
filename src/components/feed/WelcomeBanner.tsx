'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useNeighborhoodModal } from '@/components/neighborhoods/NeighborhoodSelectorModal';

const DISMISSED_KEY = 'flaneur-welcome-dismissed';

export function WelcomeBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { openModal } = useNeighborhoodModal();
  const [visible, setVisible] = useState(false);
  const welcomeCity = searchParams.get('welcome');

  useEffect(() => {
    if (!welcomeCity) return;
    if (localStorage.getItem(DISMISSED_KEY)) {
      // Already dismissed - strip param silently
      stripWelcomeParam();
      return;
    }
    setVisible(true);
  }, [welcomeCity]);

  function stripWelcomeParam() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('welcome');
    const newUrl = `/feed${params.toString() ? `?${params.toString()}` : ''}`;
    router.replace(newUrl, { scroll: false });
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
    stripWelcomeParam();
  }

  function handleCustomize() {
    openModal();
  }

  if (!visible || !welcomeCity) return null;

  return (
    <div className="bg-surface border-b border-border-strong px-4 py-3 mb-4 flex items-center justify-between gap-3">
      <p className="text-sm text-fg-muted">
        Viewing stories near{' '}
        <span className="text-fg font-medium">{welcomeCity}</span>.{' '}
        <button
          onClick={handleCustomize}
          className="text-amber-500 hover:text-amber-400 font-medium underline underline-offset-2 decoration-amber-500/40"
        >
          Customize
        </button>
      </p>
      <button
        onClick={handleDismiss}
        className="text-fg-subtle hover:text-fg shrink-0 p-1"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
