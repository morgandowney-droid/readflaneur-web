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
/**
 * Inline script for layout.tsx:
 * 1. Syncs localStorage neighborhoods to cookie on every page load
 * 2. Redirects returning users from / to /feed
 * 3. Hard gate: redirects /feed and /{city}/{neighborhood} to /onboard if not onboarded
 *
 * Onboarded = has flaneur-auth (logged in) OR flaneur-onboarded (completed onboarding) OR has neighborhoods in localStorage
 */
export const NEIGHBORHOOD_SYNC_SCRIPT = `(function(){try{var k="flaneur-neighborhood-preferences",c="flaneur-neighborhoods",s=localStorage.getItem(k),a=localStorage.getItem("flaneur-auth"),o=localStorage.getItem("flaneur-onboarded"),p=location.pathname,q=new URLSearchParams(location.search);if(q.get("auth")==="oauth"){localStorage.setItem("flaneur-auth","true");localStorage.setItem("flaneur-onboarded","true");localStorage.setItem("flaneur-newsletter-subscribed","true");a="true";o="true";var u=new URL(location.href);u.searchParams.delete("auth");history.replaceState(null,"",u.toString())}if(s){var ids=JSON.parse(s);if(Array.isArray(ids)&&ids.length>0){document.cookie=c+"="+ids.join(",")+";path=/;max-age=31536000;SameSite=Strict";if(p==="/")window.location.replace("/feed")}}else{document.cookie=c+"=;path=/;max-age=0;SameSite=Strict"}if(!a&&!o&&!s){if(p==="/feed"||p.match(/^\\/[a-z][a-z0-9-]+\\/[a-z]/))window.location.replace("/onboard")}}catch(e){}})()`;
