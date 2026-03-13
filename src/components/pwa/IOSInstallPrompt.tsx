'use client';

import { useState, useEffect } from 'react';

/**
 * iOS Safari "Add to Home Screen" install prompt.
 *
 * Shows a bottom-sheet guide after the user has read 3+ articles
 * across 2+ sessions on iOS Safari (not already installed as PWA).
 *
 * Inspired by FT, Pinterest, and Morning Brew install prompts.
 */

function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  // Already installed as standalone PWA
  const isStandalone = ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
    || window.matchMedia('(display-mode: standalone)').matches;
  return isIOS && isSafari && !isStandalone;
}

const DISMISS_KEY = 'flaneur-pwa-prompt-dismissed';
const DISMISS_COUNT_KEY = 'flaneur-pwa-prompt-dismiss-count';
const READS_KEY = 'flaneur-article-reads';
const SESSION_KEY = 'flaneur-session-count';
const DISMISS_DAYS = 30;

export function IOSInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(1);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // ?pwa-test=true bypasses all checks for preview
    const forceShow = new URLSearchParams(window.location.search).get('pwa-test') === 'true';

    if (!forceShow && !isIOSSafari()) return;

    // Check dismiss state (skipped in test mode)
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const daysSince = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince < DISMISS_DAYS) return;
    }

    if (!forceShow) {
      // Permanently dismissed after 2 dismissals
      const dismissCount = parseInt(localStorage.getItem(DISMISS_COUNT_KEY) || '0', 10);
      if (dismissCount >= 2) return;

      // Check engagement: 3+ article reads
      const reads = parseInt(localStorage.getItem(READS_KEY) || '0', 10);
      if (reads < 3) return;

      // Check engagement: 2+ sessions
      const sessions = parseInt(localStorage.getItem(SESSION_KEY) || '0', 10);
      if (sessions < 2) return;
    }

    // Show after 2s delay
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

      {/* Bottom sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-[9999] transition-transform duration-300 ease-out ${exiting ? 'translate-y-full' : 'translate-y-0'}`}
        style={{ animation: exiting ? undefined : 'slideUpSheet 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className="bg-surface border-t border-border rounded-t-2xl mx-auto max-w-lg pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-fg-subtle/30" />
          </div>

          {/* Content */}
          <div className="px-6 pb-4">
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                {/* App icon placeholder */}
                <div className="w-12 h-12 rounded-xl bg-canvas border border-border flex items-center justify-center shrink-0">
                  <span className="font-display text-lg tracking-[0.15em] text-fg">F</span>
                </div>
                <div>
                  <h3 className="font-display text-lg text-fg">Add Flaneur</h3>
                  <p className="text-xs text-fg-subtle">readflaneur.com</p>
                </div>
              </div>
              <button
                onClick={dismiss}
                className="text-fg-subtle hover:text-fg p-1 -mr-1 -mt-1"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Value prop */}
            <p className="text-sm text-fg-muted mb-6 leading-relaxed">
              Get your morning brief right from your home screen. One tap, no browser needed.
            </p>

            {/* Steps */}
            <div className="space-y-4">
              {/* Step 1 */}
              <button
                onClick={() => setStep(1)}
                className={`w-full flex items-center gap-4 p-3 rounded-xl transition-colors ${step === 1 ? 'bg-canvas border border-border' : 'opacity-60'}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${step === 1 ? 'bg-accent/10 text-accent' : 'bg-surface text-fg-subtle'}`}>
                  {/* iOS Share icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8.59 13.51l6.83-6.83M15.42 12.5V6.68h-5.83M20.33 15.87v3.75a.83.83 0 01-.83.83H4.5a.83.83 0 01-.83-.83v-3.75" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-fg">
                    Tap the share button
                  </p>
                  <p className="text-xs text-fg-subtle mt-0.5">
                    The square with arrow at the bottom of Safari
                  </p>
                </div>
                <div className={`ml-auto shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === 1 ? 'bg-accent text-canvas' : 'bg-surface text-fg-subtle border border-border'}`}>
                  1
                </div>
              </button>

              {/* Step 2 */}
              <button
                onClick={() => setStep(2)}
                className={`w-full flex items-center gap-4 p-3 rounded-xl transition-colors ${step === 2 ? 'bg-canvas border border-border' : 'opacity-60'}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${step === 2 ? 'bg-accent/10 text-accent' : 'bg-surface text-fg-subtle'}`}>
                  {/* Plus in square icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <path d="M12 8v8M8 12h8" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-fg">
                    Tap "Add to Home Screen"
                  </p>
                  <p className="text-xs text-fg-subtle mt-0.5">
                    Scroll down in the share menu to find it
                  </p>
                </div>
                <div className={`ml-auto shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === 2 ? 'bg-accent text-canvas' : 'bg-surface text-fg-subtle border border-border'}`}>
                  2
                </div>
              </button>
            </div>

            {/* Animated arrow pointing to Safari share button */}
            {step === 1 && (
              <div className="flex justify-center mt-4 pt-2">
                <div className="animate-bounce text-accent">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 5v14M5 12l7 7 7-7" />
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideUpSheet {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
