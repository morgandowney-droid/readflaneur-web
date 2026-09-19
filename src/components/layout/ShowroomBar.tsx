'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const DISMISS_KEY = 'flaneur-showroom-bar-dismissed';

/**
 * One quiet line identifying Flaneur as a showroom for a product licensed to
 * publishers, with a route to the explanation on yous.news.
 *
 * Flaneur and yous.news are two views of the same licensing business, and a
 * publisher who lands on either one has no way of knowing that. One of them
 * read the Irish site and concluded in writing that the model was "largely
 * built around scraping and summarizing others' content". The same gap exists
 * here, and Flaneur is the one that reaches publishers outside Ireland.
 *
 * Sitewide rather than homepage-only, because prospects arrive on deep links
 * to a single neighbourhood. Thin rather than blocking, because the showroom
 * has to keep working as a showroom. Dismissible, because real readers come
 * here every morning for the news and should be able to make it go away.
 *
 * Not translated: the licensing page it points at is English only.
 */
export function ShowroomBar() {
  const pathname = usePathname();
  // Render nothing until localStorage has been read, so a dismissed bar never
  // flashes in on hydration.
  const [state, setState] = useState<'unknown' | 'show' | 'hide'>('unknown');

  useEffect(() => {
    try {
      setState(localStorage.getItem(DISMISS_KEY) === '1' ? 'hide' : 'show');
    } catch {
      setState('show');
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode: it returns next visit, which is acceptable */
    }
    setState('hide');
  };

  // Not in the admin area, the partner funnel or the advertiser funnel: those
  // readers are being sold something else and the line would only confuse.
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/partner') ||
    pathname.startsWith('/advertise') ||
    pathname.startsWith('/proofs')
  ) {
    return null;
  }
  if (state !== 'show') return null;

  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-1.5 sm:px-6 lg:px-8">
        <p className="min-w-0 flex-1 text-[11px] leading-snug tracking-[0.02em] text-fg-subtle">
          A showroom for yous.news, a local news engine licensed to publishers.{' '}
          <a
            href="https://yous.news/publishers"
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap text-fg-muted underline underline-offset-2 hover:text-accent"
          >
            What we license
          </a>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 shrink-0 rounded px-1.5 py-0.5 text-[13px] leading-none text-fg-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
