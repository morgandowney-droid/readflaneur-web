/**
 * Licensees of the machine feed (/api/v1). One entry per licensee: the editions
 * its key may read and, optionally, the language it reads in by default.
 *
 * Keys are not stored. A licensee's key is derived from CRON_SECRET the same way
 * the editor desk key is (see licensee-feed.ts, and print it with
 * `node scripts/print-licensee-key.mjs <licenseeId>`), so rotating CRON_SECRET
 * rotates every key.
 *
 * Every edition listed here is also a priority edition in generation-cadence.ts:
 * a licensed edition gets the full daily pipeline (daily brief and Look Ahead
 * every morning). Without that a cold edition would publish one day in seven and
 * the feed would be empty on the other six, with every cron reporting success.
 *
 * This file has no imports on purpose: generation-cadence.ts reads it.
 */

export type FeedLanguage = 'en' | 'sv' | 'fr' | 'de' | 'es' | 'pt' | 'it' | 'zh' | 'ja';

export interface Licensee {
  /** Who the key belongs to, for our own records. Never returned to the caller. */
  name: string;
  /** Edition (neighborhood) ids the key may read. */
  editions: readonly string[];
  /** Language returned when a request has no `lang` parameter. Defaults to 'en'. */
  defaultLang?: FeedLanguage;
}

export const LICENSEES: Readonly<Record<string, Licensee>> = {
  // Demo key for technical specs and integration tests. Public showcase editions
  // only; never add a prospect's pilot edition here, because this key is sent to
  // people who are not that prospect.
  demo: {
    name: 'Demo (technical evaluation)',
    editions: [
      'paris-le-marais',
      'milan-navigli',
      'madrid-salamanca',
      'berlin-prenzlauer-berg',
    ],
  },
};

export function getLicensee(id: string): Licensee | null {
  return Object.prototype.hasOwnProperty.call(LICENSEES, id) ? LICENSEES[id] : null;
}

/** Every edition id any licensee may read. */
export const LICENSED_EDITION_IDS: ReadonlySet<string> = new Set(
  Object.values(LICENSEES).flatMap((l) => l.editions),
);
