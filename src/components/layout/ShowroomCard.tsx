'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const DISMISS_KEY = 'flaneur-showroom-card-dismissed';
const DELAY_MS = 3000;

/**
 * A one-time card, bottom corner, saying this site is a working showroom for
 * yous.news and linking to what we license.
 *
 * The top line (ShowroomBar) is easy to miss: a prospect who arrives on a deep
 * link and scrolls straight to the story never reads it (Morgan, 1 Oct 2026).
 * A centred window would cover the edition the prospect came to judge, count
 * as an intrusive interstitial on mobile, and greet every daily reader. This
 * card covers nothing important, shows once per visitor after a short delay,
 * and never returns once closed or followed.
 *
 * Not translated: the licensing page it points at is English only.
 */
export function ShowroomCard() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      dismissed = false;
    }
    if (dismissed) return;
    const t = setTimeout(() => setShow(true), DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode: it returns next visit, which is acceptable */
    }
    setShow(false);
  };

  // Same exclusions as the bar, plus the private publisher pages.
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/partner') ||
    pathname.startsWith('/advertise') ||
    pathname.startsWith('/proofs') ||
    pathname.startsWith('/editor') ||
    pathname.startsWith('/desk') ||
    pathname.startsWith('/docket')
  ) {
    return null;
  }
  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="About this site"
      className="fixed inset-x-4 bottom-4 z-[60] rounded-lg border border-border-strong bg-surface p-4 shadow-2xl sm:inset-x-auto sm:left-6 sm:bottom-6 sm:max-w-sm"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close"
        className="absolute right-2 top-2 rounded px-2 py-1 text-lg leading-none text-fg-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        &times;
      </button>
      <p className="pr-6 text-sm font-semibold text-fg">This is a working showroom.</p>
      <p className="mt-1 text-sm leading-snug text-fg-muted">
        yous.news is a local news engine licensed to publishers. Every edition here is produced by it, every morning.
      </p>
      <a
        href="https://yous.news/publishers"
        target="_blank"
        rel="noopener"
        onClick={dismiss}
        className="mt-3 inline-block text-sm font-semibold text-accent underline underline-offset-4 hover:no-underline"
      >
        What we license &rarr;
      </a>
    </div>
  );
}
