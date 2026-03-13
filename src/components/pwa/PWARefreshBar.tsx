'use client';

import { useState, useEffect } from 'react';

/**
 * Subtle refresh bar shown only in PWA standalone mode.
 * Shows the time of last page load and a refresh button,
 * since PWA mode has no browser refresh or URL bar.
 */
export function PWARefreshBar() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [loadTime, setLoadTime] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const standalone = ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
      || window.matchMedia('(display-mode: standalone)').matches;
    if (!standalone) return;

    setIsStandalone(true);
    setLoadTime(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  }, []);

  if (!isStandalone) return null;

  return (
    <div className="flex items-center justify-center gap-2 py-1.5 text-[11px] text-fg-subtle">
      <span>Updated {loadTime}</span>
      <button
        onClick={() => {
          setRefreshing(true);
          window.location.reload();
        }}
        className="text-accent hover:underline"
        aria-label="Refresh"
      >
        {refreshing ? '...' : 'Refresh'}
      </button>
    </div>
  );
}
