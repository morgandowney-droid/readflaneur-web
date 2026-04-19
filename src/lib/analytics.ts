/**
 * Lightweight client-side event tracking for funnel analysis.
 * Fire-and-forget POST to /api/analytics/track, writes to analytics_events.
 *
 * Query in SQL:
 *   SELECT event, COUNT(*) FROM analytics_events
 *   WHERE created_at > NOW() - INTERVAL '7 days'
 *   GROUP BY event ORDER BY 2 DESC;
 */

const ANON_ID_KEY = 'flaneur-anonymous-id';

function getAnonymousId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

export function track(event: string, properties: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;

  // Never block the caller. No awaits, no error propagation.
  try {
    const payload = {
      event,
      properties,
      anonymous_id: getAnonymousId(),
      path: window.location.pathname,
    };

    // Use keepalive so events fire even on unload/navigation.
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => { /* swallow */ });
  } catch {
    // swallow
  }
}
