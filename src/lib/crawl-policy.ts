/**
 * Whether a site lets us read a page: robots.txt (RFC 9309) and the
 * machine-readable text-and-data-mining reservation (TDMRep: the
 * /.well-known/tdmrep.json file, the TDM-Reservation header, and the
 * tdm-reservation meta tag), which is how a German site exercises its opt-out
 * under section 44b UrhG and an EU site under Article 4 of the DSM Directive.
 *
 * Every page our own code reads goes through fetchPage (source-check.ts), which
 * asks this module first. A page we may not read is not fetched, archived or
 * checked; a link to it may still be published, since linking is not reading.
 * Search itself runs through providers that apply robots.txt to their own
 * crawlers.
 *
 * Built 2 Oct 2026 after Axel Springer asked how we treat sites that do not
 * want to be crawled, a live question for German publishers. Pure parsing
 * functions are exported for tests.
 */

const UA_TOKEN = 'flaneursourcecheck';
const CACHE_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 4000;

export interface RobotsGroup { agents: string[]; rules: Array<{ allow: boolean; path: string }> }

/** Parse robots.txt into groups of user agents and their rules. */
export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === 'allow' || field === 'disallow') && current) {
      lastWasAgent = false;
      if (field === 'disallow' && value === '') continue; // "Disallow:" with no path allows everything
      current.rules.push({ allow: field === 'allow', path: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function patternToRegex(path: string): RegExp {
  const anchored = path.endsWith('$');
  const body = (anchored ? path.slice(0, -1) : path).replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** RFC 9309: our group (or *), longest matching rule wins, allow wins a tie. */
export function robotsAllows(groups: RobotsGroup[], pathAndQuery: string, token = UA_TOKEN): boolean {
  const ours = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const applicable = ours.length ? ours : groups.filter((g) => g.agents.includes('*'));
  let best: { allow: boolean; len: number } | null = null;
  for (const g of applicable) {
    for (const r of g.rules) {
      if (!patternToRegex(r.path).test(pathAndQuery)) continue;
      const len = r.path.replace(/\*/g, '').length;
      if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
    }
  }
  return best ? best.allow : true;
}

interface TdmRepEntry { location: string; 'tdm-reservation'?: number | string }

/** TDMRep: is this path reserved by the site's /.well-known/tdmrep.json? */
export function tdmRepReserves(entries: TdmRepEntry[], pathAndQuery: string): boolean {
  for (const e of entries) {
    if (!e || typeof e.location !== 'string') continue;
    if (!patternToRegex(e.location.replace(/^https?:\/\/[^/]+/, '') || '/').test(pathAndQuery)) continue;
    return String(e['tdm-reservation']) === '1';
  }
  return false;
}

/** The TDM-Reservation header or the tdm-reservation meta tag on a page we already read. */
export function pageReservesTdm(headers: Headers | null, html: string | null): boolean {
  if (headers && (headers.get('tdm-reservation') || '').trim() === '1') return true;
  if (!html) return false;
  return /<meta[^>]+name=["']tdm-reservation["'][^>]*content=["']1["']/i.test(html)
    || /<meta[^>]+content=["']1["'][^>]*name=["']tdm-reservation["']/i.test(html);
}

interface OriginPolicy { robots: RobotsGroup[] | 'disallow-all' | null; tdm: TdmRepEntry[]; at: number }
const cache = new Map<string, OriginPolicy>();

async function getText(url: string): Promise<{ status: number; text: string } | null> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'FlaneurSourceCheck/1.0 (+https://readflaneur.com/standards)' } });
    const text = res.ok ? (await res.text()).slice(0, 500_000) : '';
    return { status: res.status, text };
  } catch {
    return null;
  }
}

async function originPolicy(origin: string): Promise<OriginPolicy> {
  const hit = cache.get(origin);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const [robotsRes, tdmRes] = await Promise.all([getText(`${origin}/robots.txt`), getText(`${origin}/.well-known/tdmrep.json`)]);
  let robots: OriginPolicy['robots'];
  // RFC 9309: a 4xx means no rules; an unreachable file or a 5xx means assume complete disallow.
  if (!robotsRes || robotsRes.status >= 500) robots = 'disallow-all';
  else if (robotsRes.status >= 400) robots = null;
  else robots = parseRobots(robotsRes.text);
  let tdm: TdmRepEntry[] = [];
  if (tdmRes && tdmRes.status === 200) {
    try { const j = JSON.parse(tdmRes.text); if (Array.isArray(j)) tdm = j; } catch { /* not TDMRep */ }
  }
  const p = { robots, tdm, at: Date.now() };
  cache.set(origin, p);
  return p;
}

export interface CrawlVerdict { allowed: boolean; reason: 'robots-disallowed' | 'robots-unreachable' | 'tdm-reserved' | null }

/** May we fetch this URL? Never throws; a malformed URL is not fetched. */
export async function crawlVerdict(url: string): Promise<CrawlVerdict> {
  let u: URL;
  try { u = new URL(url); } catch { return { allowed: false, reason: 'robots-unreachable' }; }
  const p = await originPolicy(u.origin);
  const path = `${u.pathname}${u.search}`;
  if (p.robots === 'disallow-all') return { allowed: false, reason: 'robots-unreachable' };
  if (p.robots && !robotsAllows(p.robots, path)) return { allowed: false, reason: 'robots-disallowed' };
  if (tdmRepReserves(p.tdm, path)) return { allowed: false, reason: 'tdm-reserved' };
  return { allowed: true, reason: null };
}
