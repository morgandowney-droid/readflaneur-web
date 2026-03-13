'use client';

import { useState, useEffect } from 'react';

/**
 * iOS Safari "Add to Home Screen" install prompt.
 *
 * Shows a top card guide after the user has read 3+ articles
 * across 2+ sessions on iOS Safari (not already installed as PWA).
 * 4 steps matching exact Safari UI flow.
 */

function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  const isStandalone = ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
    || window.matchMedia('(display-mode: standalone)').matches;
  return isIOS && isSafari && !isStandalone;
}

const DISMISS_KEY = 'flaneur-pwa-prompt-dismissed';
const DISMISS_COUNT_KEY = 'flaneur-pwa-prompt-dismiss-count';
const READS_KEY = 'flaneur-article-reads';
const SESSION_KEY = 'flaneur-session-count';
const DISMISS_DAYS = 30;

// Safari "..." more icon (three dots in circle)
function MoreIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="16" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

// Safari share icon (box with upward arrow)
function ShareIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 14v5a2 2 0 002 2h12a2 2 0 002-2v-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// "View More" ellipsis rows icon
function ViewMoreIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="4" width="18" height="3" rx="1" fill="currentColor" opacity="0.4" />
      <rect x="3" y="10.5" width="18" height="3" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="3" y="17" width="18" height="3" rx="1" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

// Add to Home Screen icon (square with plus)
function AddIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const STEPS = [
  {
    icon: MoreIcon,
    title: 'Tap the \u2026 icon',
    subtitle: 'Three dots in the bottom-right corner of Safari',
  },
  {
    icon: ShareIcon,
    title: 'Tap Share',
    subtitle: 'The box with an upward arrow',
  },
  {
    icon: ViewMoreIcon,
    title: 'Scroll down and tap "Add to Home Screen"',
    subtitle: 'You may need to scroll the share sheet',
  },
  {
    icon: AddIcon,
    title: 'Tap "Add"',
    subtitle: 'Flaneur will appear on your home screen',
  },
];

export function IOSInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const forceShow = new URLSearchParams(window.location.search).get('pwa-test') === 'true';

    if (!forceShow && !isIOSSafari()) return;

    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const daysSince = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince < DISMISS_DAYS) return;
    }

    if (!forceShow) {
      const dismissCount = parseInt(localStorage.getItem(DISMISS_COUNT_KEY) || '0', 10);
      if (dismissCount >= 2) return;

      const reads = parseInt(localStorage.getItem(READS_KEY) || '0', 10);
      if (reads < 3) return;

      const sessions = parseInt(localStorage.getItem(SESSION_KEY) || '0', 10);
      if (sessions < 2) return;
    }

    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
      const count = parseInt(localStorage.getItem(DISMISS_COUNT_KEY) || '0', 10);
      localStorage.setItem(DISMISS_COUNT_KEY, (count + 1).toString());
    }, 300);
  }

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-[9998] transition-opacity duration-300 ${exiting ? 'opacity-0' : 'opacity-100'}`}
        onClick={dismiss}
      />

      {/* Top card */}
      <div
        className={`fixed top-0 left-0 right-0 z-[9999] transition-transform duration-300 ease-out ${exiting ? '-translate-y-full' : 'translate-y-0'}`}
        style={{ animation: exiting ? undefined : 'slideDownCard 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className="bg-surface border-b border-border rounded-b-2xl mx-auto max-w-lg pt-[max(1rem,env(safe-area-inset-top))]">
          {/* Content */}
          <div className="px-5 pb-5 pt-3">
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-canvas border border-border flex items-center justify-center shrink-0">
                  <span className="font-display text-base tracking-[0.15em] text-fg">F</span>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-fg">Add Flaneur to Home Screen</h3>
                  <p className="text-xs text-fg-subtle">One tap access to your morning brief</p>
                </div>
              </div>
              <button
                onClick={dismiss}
                className="text-fg-subtle hover:text-fg p-1.5 -mr-1"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Steps */}
            <div className="space-y-1">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-2.5 px-2 rounded-lg"
                  >
                    {/* Number badge */}
                    <div className="w-6 h-6 rounded-full bg-accent text-canvas flex items-center justify-center text-xs font-semibold shrink-0">
                      {i + 1}
                    </div>
                    {/* Icon */}
                    <div className="w-8 h-8 rounded-lg bg-canvas border border-border flex items-center justify-center shrink-0">
                      <Icon className="text-fg" />
                    </div>
                    {/* Text */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg leading-snug">{s.title}</p>
                      <p className="text-xs text-fg-subtle leading-snug mt-0.5">{s.subtitle}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Dismiss link */}
            <button
              onClick={dismiss}
              className="w-full text-center text-xs text-fg-subtle hover:text-fg-muted mt-3 py-1"
            >
              Maybe later
            </button>
          </div>

          {/* Drag handle at bottom */}
          <div className="flex justify-center pb-2">
            <div className="w-10 h-1 rounded-full bg-fg-subtle/20" />
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideDownCard {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
