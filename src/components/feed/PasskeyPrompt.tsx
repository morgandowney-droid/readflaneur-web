'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const DISMISSED_KEY = 'flaneur-passkey-prompt-dismissed';
const OFFERED_KEY = 'flaneur-passkey-prompt-offered';

/**
 * One-time banner suggesting users add a passkey after their first login.
 * Shows on the feed page for authenticated users who haven't dismissed it.
 * Only shows once per device (OFFERED_KEY prevents re-showing after dismiss).
 */
export function PasskeyPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if: no auth, already dismissed, already offered, or browser doesn't support passkeys
    const hasAuth = localStorage.getItem('flaneur-auth');
    if (!hasAuth) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    if (localStorage.getItem(OFFERED_KEY)) return;

    // Check WebAuthn support
    if (!window.PublicKeyCredential) return;

    // Don't show on very first visit (let user explore first)
    // Show after second session or if they've read at least one article
    const sessionCount = parseInt(localStorage.getItem('flaneur-session-count') || '0', 10);
    const articleReads = parseInt(localStorage.getItem('flaneur-article-reads') || '0', 10);
    if (sessionCount < 2 && articleReads < 1) return;

    // Mark as offered so it only shows once
    localStorage.setItem(OFFERED_KEY, '1');
    setVisible(true);
  }, []);

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="bg-surface border-b border-border-strong px-4 py-3 mb-4 flex items-center justify-between gap-3">
      <p className="text-sm text-fg-muted">
        Speed up your next sign-in -{' '}
        <Link
          href="/account"
          className="text-accent hover:text-accent/80 font-medium underline underline-offset-2 decoration-accent/40"
        >
          add a passkey
        </Link>
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
