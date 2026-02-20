/**
 * Sync neighborhood preferences from localStorage to a cookie
 * so the server can read them without putting IDs in the URL.
 *
 * Cookie: flaneur-neighborhoods (comma-separated IDs)
 * Path: / (available to all server routes)
 * SameSite: Strict (not sent cross-origin)
 */

export const NEIGHBORHOODS_COOKIE = 'flaneur-neighborhoods';
const PREFS_KEY = 'flaneur-neighborhood-preferences';

/** Client-side: sync localStorage neighborhood IDs to cookie */
export function syncNeighborhoodCookie(): void {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) {
      const ids = JSON.parse(stored);
      if (Array.isArray(ids) && ids.length > 0) {
        document.cookie = `${NEIGHBORHOODS_COOKIE}=${ids.join(',')};path=/;max-age=31536000;SameSite=Strict`;
        return;
      }
    }
    // Clear cookie if no preferences
    document.cookie = `${NEIGHBORHOODS_COOKIE}=;path=/;max-age=0;SameSite=Strict`;
  } catch {
    // Ignore - localStorage may not be available
  }
}

/**
 * Inline script string for layout.tsx <script> tag.
 * Syncs cookie on every page load AND redirects returning users from / to /feed.
 */
export const NEIGHBORHOOD_SYNC_SCRIPT = `(function(){try{var k="flaneur-neighborhood-preferences",c="flaneur-neighborhoods",s=localStorage.getItem(k);if(s){var ids=JSON.parse(s);if(Array.isArray(ids)&&ids.length>0){document.cookie=c+"="+ids.join(",")+";path=/;max-age=31536000;SameSite=Strict";if(location.pathname==="/")window.location.replace("/feed")}}else{document.cookie=c+"=;path=/;max-age=0;SameSite=Strict"}}catch(e){}})()`;
