/**
 * Per-publisher edition rules.
 *
 * A licensee sets editorial rules for its own editions: sources it will not
 * carry, topics it does not want, and a sourcing standard. GEDI was promised
 * these in writing on 23 Sep 2026, and the German publishers' association asked
 * the same day how a publisher blocks a source. One mechanism serves every
 * licensee: a group of edition ids, and the rules that apply to them.
 *
 * Enforced in two layers, the house pattern (see the namesake-town and
 * Americanism lessons in CLAUDE.md): the prompt block asks the search and the
 * enrichment models to follow the rules, which reduces the error, and the
 * deterministic filter below removes it. The filter runs on the enriched story
 * list (enriched_categories) and the [[section]] body, removes blocked sources,
 * drops stories that no longer meet the sourcing rule or that fall under an
 * excluded topic, and rebuilds the body so no orphan [[header]] remains.
 *
 * An edition with no group gets null from rulesForEdition() and nothing else in
 * the pipeline changes for it.
 *
 * Pure: only relative imports of pure modules, so scripts/test-edition-rules.mjs
 * can compile and test it without the app. The model review lives in
 * edition-rules-review.ts.
 */
import { isPlaceholderSourceName, matchSourceToChunk, type GroundingChunk, type SourceRef } from './source-links';
import { CRIME_OR_COURT } from './sensitive-story-rules';

// ─── Config ────────────────────────────────────────────────────────────────

export interface EditionRuleGroup {
  /** Who the rules belong to, for logs and editor notes. */
  label: string;
  /** Exact edition ids in the group. */
  editionIds?: string[];
  /** Id prefixes, e.g. 'vorarlberg-' for every Vorarlberg edition. */
  editionIdPrefixes?: string[];
  /** Key into NEWSPAPERS_OF_RECORD. */
  recordCountry: string;
  /**
   * Sources the publisher will not carry. Each entry is one of:
   *  - a domain, 'corriere.it' (also blocks milano.corriere.it)
   *  - a URL prefix for one social page, account or group,
   *    'facebook.com/groups/12345', 'instagram.com/somepage', 'x.com/handle'
   *  - a publication name, 'Corriere della Sera'
   */
  blockedSources: string[];
  /** Words or phrases; a story mentioning one is dropped. Case-insensitive. */
  blockedTopics: string[];
  /** Active criminal cases out unless a newspaper of record reported it, and never naming a private individual. */
  excludeActiveCrime: boolean;
  /** Party politics and political commentary out. Council decisions stay. */
  excludePartyPolitics: boolean;
  /** Match reports, results and commentary out. Fixtures may stay as listing events. */
  excludeSportsCommentary: boolean;
  /** No personal information about private individuals. */
  protectPrivateIndividuals: boolean;
  /**
   * A story with a named person, date or figure needs two independent sources
   * unless one is a newspaper of record. Where a story rests on social media,
   * the second source must be a different kind (not social).
   */
  requireTwoSourcesForNamedFacts: boolean;
}

export const EDITION_RULE_GROUPS: Record<string, EditionRuleGroup> = {
  // GEDI (la Repubblica, La Stampa). Rules as promised in the written note of
  // 23 Sep 2026, after the call with Mirja Cartia d'Asero.
  gedi: {
    label: 'GEDI',
    editionIds: ['milan-brera', 'milan-porta-venezia', 'rome-prati', 'sicily-scicli'],
    recordCountry: 'italy',
    blockedSources: [
      // Add entries as GEDI names them, for example:
      // 'ilgiornale.it',                    // a whole domain, subdomains included
      // 'facebook.com/groups/1234567890',   // one Facebook group
      // 'instagram.com/somepage',           // one Instagram account
      // 'Il Fatto Quotidiano',              // a publication, by name
    ],
    blockedTopics: [],
    excludeActiveCrime: true,
    excludePartyPolitics: true,
    excludeSportsCommentary: true,
    protectPrivateIndividuals: true,
    // Off (2026-09-23). Forcing a second source pushes the model to invent one,
    // which yous.news and Flaneur both saw in early development, and enrichment
    // gives almost every story a single source, so the rule would cut most of
    // the edition. Measured in shadow first: see scripts/ and the
    // shadow-edition-rules cron before switching it back on.
    requireTwoSourcesForNamedFacts: false,
  },
  // Examples for the other licensees. Not active: nothing has been agreed with
  // them, and an edition without a group must behave exactly as before.
  // russmedia: {
  //   label: 'Russmedia',
  //   editionIdPrefixes: ['vorarlberg-'],
  //   recordCountry: 'austria',
  //   blockedSources: [], blockedTopics: [],
  //   excludeActiveCrime: true, excludePartyPolitics: false, excludeSportsCommentary: false,
  //   protectPrivateIndividuals: true, requireTwoSourcesForNamedFacts: false,
  // },
  // canadianpress: {
  //   label: 'The Canadian Press',
  //   editionIdPrefixes: ['newfoundland-'],
  //   recordCountry: 'canada',
  //   ...
  // },
};

/**
 * Newspapers of record per country: a story they reported may stand on that
 * one source, and an active criminal case may run only if one of them carried
 * it. Kept deliberately small so it can be reviewed at a glance.
 */
export const NEWSPAPERS_OF_RECORD: Record<string, { names: string[]; domains: string[] }> = {
  italy: {
    names: [
      'la repubblica', 'repubblica', 'corriere della sera', 'la stampa', 'il sole 24 ore',
      'il messaggero', 'il mattino', 'la sicilia', 'giornale di sicilia', 'il giorno',
      'ansa', 'agi', 'adnkronos',
    ],
    domains: [
      'repubblica.it', 'corriere.it', 'lastampa.it', 'ilsole24ore.com', 'ilmessaggero.it',
      'ilmattino.it', 'lasicilia.it', 'gds.it', 'ilgiorno.it', 'ansa.it', 'agi.it', 'adnkronos.com',
    ],
  },
};

export interface EditionRules extends EditionRuleGroup {
  groupId: string;
  editionId: string;
}

/** The rules for an edition, or null when it belongs to no group. */
export function rulesForEdition(editionId: string | null | undefined): EditionRules | null {
  if (!editionId) return null;
  for (const [groupId, group] of Object.entries(EDITION_RULE_GROUPS)) {
    const inList = group.editionIds?.includes(editionId);
    const byPrefix = group.editionIdPrefixes?.some((p) => editionId.startsWith(p));
    if (inList || byPrefix) return { ...group, groupId, editionId };
  }
  return null;
}

// ─── Prompt layer ──────────────────────────────────────────────────────────

/** Instructions for search and enrichment prompts. Empty for an edition without rules. */
export function editionRulesBlock(rules: EditionRules | null | undefined): string {
  if (!rules) return '';
  const lines: string[] = [];
  if (rules.blockedSources.length > 0) {
    lines.push(`- Never use, cite or rely on these sources: ${rules.blockedSources.join('; ')}. A story known only from one of them must be left out.`);
  }
  if (rules.blockedTopics.length > 0) {
    lines.push(`- Leave out any story about: ${rules.blockedTopics.join('; ')}.`);
  }
  if (rules.excludePartyPolitics) {
    lines.push('- No party politics and no political commentary: no parties, campaigns, candidates, polls or politicians trading positions. Council and city decisions that change something for residents (a road, a school, a planning approval) are civic news and may stay, reported without party colour.');
  }
  if (rules.excludeSportsCommentary) {
    lines.push('- No sports commentary, match reports, results or player talk. An upcoming fixture may appear only as a listing: who, where, when.');
  }
  if (rules.protectPrivateIndividuals) {
    lines.push('- No personal information about private individuals: no names, ages, addresses, health, family or employment details of people who are not public figures acting in a public role.');
  }
  if (rules.excludeActiveCrime) {
    const papers = NEWSPAPERS_OF_RECORD[rules.recordCountry]?.names || [];
    lines.push(`- No active criminal cases (arrests, investigations, charges, trials) unless a newspaper of record${papers.length ? ` (${papers.slice(0, 8).join(', ')})` : ''} has reported it, and even then never name a private individual.`);
  }
  if (rules.requireTwoSourcesForNamedFacts) {
    lines.push('- Every named person, date or figure needs two independent sources unless one of them is a newspaper of record. Give BOTH sources for each story (source and secondarySource). If a story rests on a social media post, the second source must be a different kind: a news site, an official site or a venue page, never another social post. If you cannot find the second source, leave the story out.');
  }
  if (lines.length === 0) return '';
  return `\n\nPUBLISHER RULES FOR THIS EDITION (${rules.label}). These are the publisher's editorial rules. A story that breaks any of them must be DROPPED, not softened:\n${lines.join('\n')}\n`;
}

// ─── Sources ───────────────────────────────────────────────────────────────

export type SourceKind = 'record' | 'social' | 'other';

const SOCIAL_HOSTS = [
  'facebook.com', 'fb.com', 'instagram.com', 'x.com', 'threads.net', 'tiktok.com', 'youtube.com',
  'youtu.be', 'linkedin.com', 'reddit.com', 't.me', 'telegram.me', 'bsky.app', 'mastodon.social',
  'whatsapp.com', 'nextdoor.com', 'pinterest.com', 'snapchat.com',
];
const SOCIAL_NAME = /(^@)|\b(facebook|instagram|twitter|tiktok|youtube|threads|linkedin|reddit|telegram|bluesky|whatsapp|nextdoor)\b|(^x$)|(^x \()|\bx\.com\b/i;

export function normalizeName(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanHost(host: string): string {
  let h = host.toLowerCase().replace(/\.$/, '');
  h = h.replace(/^(www|m|mobile|mbasic|web)\./, '');
  if (h === 'twitter.com') h = 'x.com';
  return h;
}

/** 'https://www.Facebook.com/Groups/123/?ref=x' -> 'facebook.com/groups/123' */
export function normalizeUrlKey(url: string): string {
  let s = url.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, '');
  s = s.split(/[?#]/)[0];
  const slash = s.indexOf('/');
  const host = cleanHost(slash >= 0 ? s.slice(0, slash) : s);
  const path = slash >= 0 ? s.slice(slash) : '';
  return (host + path).replace(/\/+$/, '');
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url.trim())) return null;
  try {
    return cleanHost(new URL(url.trim()).hostname);
  } catch {
    return null;
  }
}

const TWO_LEVEL_TLDS = /\.(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/;

export function registrableDomain(host: string): string {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  return TWO_LEVEL_TLDS.test(host) ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
}

function hostMatchesDomain(host: string, domain: string): boolean {
  const d = cleanHost(domain);
  return host === d || host.endsWith('.' + d);
}

/** The blockedSources entry that matches this source, or null. */
export function matchBlockedSource(ref: SourceRef | null | undefined, blocked: string[]): string | null {
  if (!ref || blocked.length === 0) return null;
  const host = hostOf(ref.url);
  const urlKey = ref.url && host ? normalizeUrlKey(ref.url) : null;
  const name = normalizeName(ref.name);
  const handle = (ref.name || '').trim().startsWith('@') ? (ref.name || '').trim().slice(1).toLowerCase() : null;

  for (const raw of blocked) {
    const entry = raw.trim();
    if (!entry) continue;
    const looksLikeUrl = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(entry.replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, ''));
    if (looksLikeUrl && entry.replace(/^[a-z]+:\/\//i, '').includes('/')) {
      // URL prefix: one page, account or group.
      const key = normalizeUrlKey(entry);
      if (urlKey && (urlKey === key || urlKey.startsWith(key + '/'))) return raw;
      // "@handle" named without a URL, against an x.com/handle entry
      if (handle && key === `x.com/${handle}`) return raw;
      continue;
    }
    if (looksLikeUrl) {
      // Domain, subdomains included.
      const domain = normalizeUrlKey(entry);
      if (host && hostMatchesDomain(host, domain)) return raw;
      if (name && (name === normalizeName(domain) || name.replace(/ /g, '.') === domain)) return raw;
      continue;
    }
    // Publication name.
    const n = normalizeName(entry);
    if (n && name && (name === n || name.startsWith(n + ' '))) return raw;
  }
  return null;
}

export function isSocialSource(ref: SourceRef | null | undefined): boolean {
  if (!ref) return false;
  const host = hostOf(ref.url);
  if (host && SOCIAL_HOSTS.some((d) => hostMatchesDomain(host, d))) return true;
  if (host) return false; // a real non-social URL outranks a social-sounding name
  return SOCIAL_NAME.test((ref.name || '').trim());
}

export function isNewspaperOfRecord(ref: SourceRef | null | undefined, recordCountry: string): boolean {
  if (!ref) return false;
  const list = NEWSPAPERS_OF_RECORD[recordCountry];
  if (!list) return false;
  const host = hostOf(ref.url);
  if (host) {
    if (SOCIAL_HOSTS.some((d) => hostMatchesDomain(host, d))) return false; // a paper's Facebook page is social
    return list.domains.some((d) => hostMatchesDomain(host, d));
  }
  // Full names only: "La Sicilia" is the paper, "Sicilia Tourism" is not.
  const name = normalizeName(ref.name);
  return list.names.some((n) => name === n || name.startsWith(n + ' '));
}

export function sourceKind(ref: SourceRef, recordCountry: string): SourceKind {
  if (isNewspaperOfRecord(ref, recordCountry)) return 'record';
  if (isSocialSource(ref)) return 'social';
  return 'other';
}

/**
 * Independence key. Two pages on one domain are one source; two social
 * accounts on one platform are two sources (but both social).
 */
export function sourceKey(ref: SourceRef): string {
  const host = hostOf(ref.url);
  if (host) {
    if (SOCIAL_HOSTS.some((d) => hostMatchesDomain(host, d))) {
      const parts = normalizeUrlKey(ref.url as string).split('/');
      const seg = parts[1] === 'groups' || parts[1] === 'pages' ? `${parts[1]}/${parts[2] || ''}` : parts[1] || '';
      return `${registrableDomain(host)}/${seg}`;
    }
    return registrableDomain(host);
  }
  return `name:${normalizeName(ref.name)}`;
}

// ─── Stories ───────────────────────────────────────────────────────────────

export interface RuleStory {
  index: number;
  category: string;
  entity: string;
  context: string;
  sources: SourceRef[];
}

interface RawStory {
  entity?: string;
  context?: string;
  source?: SourceRef | null;
  secondarySource?: SourceRef | null;
  [k: string]: unknown;
}
interface RawCategory {
  name?: string;
  stories?: RawStory[];
  [k: string]: unknown;
}

/** Flatten enriched_categories in reading order, with stable indexes. */
export function flattenStories(categories: unknown): RuleStory[] {
  if (!Array.isArray(categories)) return [];
  const out: RuleStory[] = [];
  for (const cat of categories as RawCategory[]) {
    for (const s of cat?.stories || []) {
      const entity = (s?.entity || '').trim();
      const context = (s?.context || '').trim();
      if (!entity && !context) continue;
      const sources = [s?.source, s?.secondarySource]
        .filter((r): r is SourceRef => !!r && !!r.name && !isPlaceholderSourceName(r.name));
      out.push({ index: out.length, category: (cat?.name || '').trim(), entity, context, sources });
    }
  }
  return out;
}

const MONTHS = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b/i;

/** Words that start capitalised pairs but are places, venues or institutions, not people. */
const NOT_A_PERSON = new Set([
  'via', 'viale', 'piazza', 'piazzale', 'corso', 'largo', 'vicolo', 'teatro', 'museo', 'chiesa', 'basilica',
  'galleria', 'palazzo', 'parco', 'villa', 'porta', 'ponte', 'stazione', 'mercato', 'comune', 'municipio',
  'biblioteca', 'fondazione', 'accademia', 'pinacoteca', 'castello', 'duomo', 'cinema', 'caffe', 'bar',
  'trattoria', 'osteria', 'ristorante', 'pizzeria', 'hotel', 'scuola', 'liceo', 'universita', 'ospedale',
  'the', 'a', 'an', 'this', 'that', 'on', 'in', 'at', 'from', 'for', 'and', 'but', 'with', 'after', 'before',
  'today', 'tomorrow', 'tonight', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'street', 'road', 'square', 'avenue', 'lane', 'park', 'gallery', 'museum', 'theatre', 'theater', 'church',
  'council', 'city', 'town', 'district', 'station', 'market', 'festival', 'school', 'university', 'hospital',
  'good', 'buongiorno', 'buona', 'milan', 'milano', 'rome', 'roma', 'sicily', 'sicilia', 'italy', 'italia',
  'brera', 'prati', 'scicli', 'venezia', 'san', 'santa', 'santo', 'sant', 'saint', 'st', 'new', 'old', 'grand',
  'fashion', 'design', 'week', 'art', 'music', 'food', 'wine', 'jazz', 'opera', 'orchestra', 'ansa', 'agi',
]);

/**
 * Heuristic: does the text name what looks like a person? Two capitalised
 * words in a row that are not a street, venue or institution. Deliberately
 * over-eager, because it is only used to fail closed.
 */
export function looksLikePersonName(text: string): boolean {
  const clean = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  const re = /\b([A-Z][a-zà-ÿ'’]{1,})\s+(?:(?:de|di|da|del|della|van|von|le|la|lo|dal|dalla)\s+)?([A-Z][a-zà-ÿ'’]{1,})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    const a = normalizeName(m[1]);
    const b = normalizeName(m[2]);
    if (NOT_A_PERSON.has(a) || NOT_A_PERSON.has(b)) continue;
    return true;
  }
  return false;
}

/** A named person, date or figure. Almost every news story has one; that is the point of the rule. */
export function hasNamedFacts(text: string): boolean {
  return /\d/.test(text) || MONTHS.test(text) || looksLikePersonName(text);
}

// Italian terms alongside the shared English rules: enrichment writes English,
// but quoted phrases and names arrive in the local language.
const IT_CRIME = /\b(arrestat[oaie]|carabinieri|questura|procura|indagat[oaie]|tribunale|processo penale|rapina|omicidio|furto|truffa|denunciat[oaie]|spaccio|sequestro)\b/i;
// Party names and campaign language. Full names where the surname is also an
// ordinary word ("meloni" are melons, "conte" is a count).
const PARTY_POLITICS = /\b(political part(y|ies)|party (leader|member|rally|congress|conference|primary)|election campaign|(election|electoral|mayoral) candidates?|candidacy|polls? (show|suggest)|opinion poll|centre-(left|right)|center-(left|right)|left-wing|right-wing|opposition party|ruling party|coalition government|partito|campagna elettorale|centrodestra|centrosinistra|primarie|fratelli d'italia|forza italia|movimento 5 stelle|m5s|italia viva|alleanza verdi|lega (nord|salvini)|salvini|giorgia meloni|schlein|giuseppe conte|tajani|renzi|calenda)\b|\bPD\b|\bFdI\b/i;
const SPORT_WORDS = /\b(goals?|scored|scorer|match|game|derby|league|serie [abc]|campionato|coach|manager|allenatore|striker|midfielder|defender|goalkeeper|win|won|victory|defeat|defeated|beat|lost|draw|drew|points|standings|relegation|transfer|calciomercato|pagelle|playoffs?)\b/i;
// A scoreline, not a time range ("18:00-20:00") and not a season ("2025-26").
const SCORELINE = /(^|[^:\d])\d{1,2}\s?[-–]\s?\d{1,2}(?![:\d])/;
const SPORT_COMMENTARY = /\b(match report|post-match|player ratings|pagelle|transfer (news|rumou?rs?|window)|calciomercato|(coach|manager|allenatore) (said|says|admitted|blamed|praised))\b/i;

export type TopicRule = 'active-crime' | 'party-politics' | 'sports-commentary' | `blocked-topic:${string}`;

/** Fixed topic rules on a piece of text. */
export function topicHits(text: string, rules: EditionRules): TopicRule[] {
  const hits: TopicRule[] = [];
  if (rules.excludeActiveCrime && (CRIME_OR_COURT.test(text) || IT_CRIME.test(text))) hits.push('active-crime');
  if (rules.excludePartyPolitics && PARTY_POLITICS.test(text)) hits.push('party-politics');
  if (rules.excludeSportsCommentary && (SPORT_COMMENTARY.test(text) || (SPORT_WORDS.test(text) && SCORELINE.test(text)))) {
    hits.push('sports-commentary');
  }
  const lower = normalizeName(text);
  for (const t of rules.blockedTopics) {
    const n = normalizeName(t);
    if (n && ` ${lower} `.includes(` ${n} `)) hits.push(`blocked-topic:${t}`);
  }
  return hits;
}

export interface SourceVerdict {
  kept: SourceRef[];
  blocked: string[];
  failure: string | null;
}

/** Apply blockedSources and the sourcing standard to one story. */
export function sourceVerdict(story: RuleStory, rules: EditionRules, text?: string): SourceVerdict {
  const blocked: string[] = [];
  const kept: SourceRef[] = [];
  for (const ref of story.sources) {
    const hit = matchBlockedSource(ref, rules.blockedSources);
    if (hit) blocked.push(`${ref.name} (${hit})`);
    else kept.push(ref);
  }
  if (kept.length === 0) {
    return { kept, blocked, failure: blocked.length > 0 ? 'only-source-blocked' : 'no-source' };
  }
  const kinds = kept.map((r) => sourceKind(r, rules.recordCountry));
  if (kinds.includes('record')) return { kept, blocked, failure: null };

  const facts = hasNamedFacts(text ?? `${story.entity}\n${story.context}`);
  const restsOnSocial = kinds.includes('social');
  if (!rules.requireTwoSourcesForNamedFacts || (!facts && !restsOnSocial)) {
    return { kept, blocked, failure: null };
  }

  const distinct = new Map<string, SourceKind>();
  kept.forEach((r, i) => { if (!distinct.has(sourceKey(r))) distinct.set(sourceKey(r), kinds[i]); });
  if (distinct.size < 2) {
    return { kept, blocked, failure: restsOnSocial ? 'social-without-second-source' : 'single-source-named-fact' };
  }
  if (restsOnSocial && !Array.from(distinct.values()).some((k) => k !== 'social')) {
    return { kept, blocked, failure: 'social-without-different-kind' };
  }
  return { kept, blocked, failure: null };
}

// ─── Model verdicts and decisions ──────────────────────────────────────────

/** What the second-model review said about one story. */
export interface ModelVerdict {
  index: number;
  supported: boolean;
  partyPolitics: boolean;
  sportsCommentary: boolean;
  activeCrime: boolean;
  namesPrivateIndividual: boolean;
  privatePersonalInfo: boolean;
  reason?: string;
}

export interface StoryDecision {
  index: number;
  entity: string;
  keep: boolean;
  /** Every rule that fired; the first is the one reported. */
  rules: string[];
  keptSources: SourceRef[];
  blockedSources: string[];
}

/**
 * Decide each story. `verdicts` is the model review: null means the review
 * failed, and a story that is missing from it is treated the same way. On a
 * failed review a story that names a person is dropped; anything else stays.
 */
export function decideStories(
  stories: RuleStory[],
  rules: EditionRules,
  verdicts: Map<number, ModelVerdict> | null,
  proseByStory?: Map<number, string>,
  reviewRequired = true,
): StoryDecision[] {
  return stories.map((story) => {
    const text = `${story.entity}\n${story.context}\n${proseByStory?.get(story.index) || ''}`;
    const fired: string[] = [];
    const sv = sourceVerdict(story, rules, text);
    if (sv.failure) fired.push(sv.failure);

    const topics = topicHits(text, rules);
    const v = verdicts?.get(story.index) || null;

    for (const t of topics) if (t !== 'active-crime') fired.push(t);
    if (v) {
      if (rules.excludePartyPolitics && v.partyPolitics) fired.push('party-politics (review)');
      if (rules.excludeSportsCommentary && v.sportsCommentary) fired.push('sports-commentary (review)');
      if (rules.protectPrivateIndividuals && v.privatePersonalInfo) fired.push('private-individual (review)');
      if (!v.supported) fired.push(`unsupported-by-sources (review)${v.reason ? `: ${v.reason}` : ''}`);
    } else if (reviewRequired && looksLikePersonName(text)) {
      fired.push('review-unavailable-names-person');
    }

    const crime = topics.includes('active-crime') || (v?.activeCrime ?? false);
    if (rules.excludeActiveCrime && crime) {
      const hasRecord = sv.kept.some((r) => isNewspaperOfRecord(r, rules.recordCountry));
      if (!hasRecord) fired.push('active-crime-without-newspaper-of-record');
      else if (v ? v.namesPrivateIndividual : looksLikePersonName(text)) fired.push('active-crime-names-private-individual');
    }

    return {
      index: story.index,
      entity: story.entity,
      keep: fired.length === 0,
      rules: Array.from(new Set(fired)),
      keptSources: sv.kept,
      blockedSources: sv.blocked,
    };
  });
}

// ─── Body structure ────────────────────────────────────────────────────────

interface Section {
  header: string;
  isDate: boolean;
  paragraphs: string[];
}

interface ParsedBody {
  listing: string | null;
  preamble: string[];
  sections: Section[];
}

const DATE_HEADER = /^(today|tomorrow|tonight|this weekend|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b|^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d/i;

function splitParagraphs(lines: string[]): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (cur.length) out.push(cur.join('\n'));
      cur = [];
    } else {
      cur.push(line);
    }
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

/** Split a Look Ahead's [[Event Listing]] ... --- block from the prose. */
function splitListing(body: string): { listing: string | null; prose: string } {
  const trimmed = body.replace(/^\s+/, '');
  if (!/^\[\[Event Listing\]\]/i.test(trimmed)) return { listing: null, prose: body };
  const m = trimmed.match(/\n-{3,}[ \t]*(\n|$)/);
  if (!m || m.index === undefined) return { listing: trimmed, prose: '' };
  const end = m.index + m[0].length;
  return { listing: trimmed.slice(0, end).trim(), prose: trimmed.slice(end) };
}

function parseProse(prose: string): { preamble: string[]; sections: Section[] } {
  const preambleLines: string[] = [];
  const sections: { header: string; isDate: boolean; lines: string[] }[] = [];
  for (const line of prose.split('\n')) {
    const m = line.match(/^\s*\[\[([^\]]+)\]\]\s*(.*)$/);
    if (m) {
      const header = m[1].trim();
      sections.push({ header, isDate: DATE_HEADER.test(header), lines: m[2] ? [m[2]] : [] });
    } else if (sections.length) {
      sections[sections.length - 1].lines.push(line);
    } else {
      preambleLines.push(line);
    }
  }
  return {
    preamble: splitParagraphs(preambleLines),
    sections: sections.map((s) => ({ header: s.header, isDate: s.isDate, paragraphs: splitParagraphs(s.lines) })),
  };
}

export function parseBody(body: string): ParsedBody {
  const { listing, prose } = splitListing(body || '');
  return { listing, ...parseProse(prose) };
}

// ─── Matching prose to stories ─────────────────────────────────────────────

const STOP = new Set([
  'with', 'from', 'this', 'that', 'will', 'have', 'has', 'their', 'there', 'which', 'about', 'after', 'into',
  'over', 'near', 'also', 'more', 'most', 'than', 'then', 'just', 'your', 'they', 'them', 'were', 'been',
  'being', 'what', 'when', 'where', 'while', 'here', 'only', 'some', 'such', 'each', 'other', 'these', 'those',
  'della', 'delle', 'degli', 'dello', 'nella', 'nelle', 'sono', 'anche', 'come', 'dove', 'questo', 'questa',
  'today', 'tomorrow', 'tonight', 'week', 'weekend', 'open', 'opens', 'opening', 'event', 'events', 'local',
  'locals', 'residents', 'neighbourhood', 'neighborhood', 'area', 'city', 'town', 'street', 'free', 'daily',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february',
  'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'morning',
  'evening', 'night', 'afternoon', 'year', 'years', 'first', 'last', 'next', 'new',
]);

function sigWords(s: string, exclude: Set<string>): string[] {
  const words = normalizeName(s).split(' ').filter((w) => w.length >= 4 && !STOP.has(w) && !exclude.has(w));
  return Array.from(new Set(words));
}

function stripLinks(s: string): string {
  return s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

interface StoryMatcher {
  index: number;
  phrase: string;
  entityWords: string[];
  contextWords: string[];
}

function buildMatchers(stories: RuleStory[], placeNames: string[]): StoryMatcher[] {
  const exclude = new Set(placeNames.flatMap((p) => normalizeName(p).split(' ')).filter(Boolean));
  return stories.map((s) => {
    const main = s.entity.replace(/\s*\([^)]*\)/g, '').trim();
    const phrase = normalizeName(main);
    return {
      index: s.index,
      phrase: phrase.length >= 5 && !exclude.has(phrase) ? phrase : '',
      entityWords: sigWords(s.entity, exclude),
      contextWords: sigWords(s.context, exclude).slice(0, 20),
    };
  });
}

function scoreText(text: string, m: StoryMatcher): number {
  const hay = ` ${normalizeName(stripLinks(text))} `;
  if (m.phrase && hay.includes(` ${m.phrase} `)) return 1;
  const frac = (ws: string[]) => (ws.length ? ws.filter((w) => hay.includes(` ${w} `)).length / ws.length : 0);
  return 0.6 * frac(m.entityWords) + 0.4 * frac(m.contextWords);
}

const ASSIGN_THRESHOLD = 0.4;
const CONTAMINATION_THRESHOLD = 0.5;

function bestMatch(text: string, matchers: StoryMatcher[]): { index: number; score: number } | null {
  let best: { index: number; score: number } | null = null;
  for (const m of matchers) {
    const s = scoreText(text, m);
    if (s >= ASSIGN_THRESHOLD && (!best || s > best.score)) best = { index: m.index, score: s };
  }
  return best;
}

interface Unit {
  kind: 'preamble' | 'section' | 'paragraph';
  sectionIndex: number; // -1 for preamble
  paragraphIndex: number; // -1 for a whole section
  text: string;
}

function unitsOf(parsed: ParsedBody): Unit[] {
  const units: Unit[] = [];
  parsed.preamble.forEach((p, i) => units.push({ kind: 'preamble', sectionIndex: -1, paragraphIndex: i, text: p }));
  parsed.sections.forEach((s, si) => {
    if (s.isDate) {
      s.paragraphs.forEach((p, pi) => units.push({ kind: 'paragraph', sectionIndex: si, paragraphIndex: pi, text: p }));
    } else {
      units.push({ kind: 'section', sectionIndex: si, paragraphIndex: -1, text: `${s.header}\n${s.paragraphs.join('\n')}` });
    }
  });
  return units;
}

/** Each story's prose, for the model review and the rules that read the text. */
export function mapStoriesToProse(body: string, stories: RuleStory[], placeNames: string[] = []): Map<number, string> {
  const matchers = buildMatchers(stories, placeNames);
  const out = new Map<number, string>();
  for (const u of unitsOf(parseBody(body))) {
    const b = bestMatch(u.text, matchers);
    if (b) out.set(b.index, [out.get(b.index), u.text].filter(Boolean).join('\n\n'));
  }
  return out;
}

// ─── Applying the rules ────────────────────────────────────────────────────

export interface Removal {
  /** The [[header]], or the first words of the paragraph or listing line. */
  header: string;
  rule: string;
}

export interface ListingEvent {
  name: string;
  category?: string | null;
  location?: string | null;
  address?: string | null;
}

export interface ApplyInput<E extends ListingEvent = ListingEvent> {
  body: string;
  categories: unknown;
  rules: EditionRules;
  /** Model review verdicts; null when the review failed. */
  verdicts?: Map<number, ModelVerdict> | null;
  /** False at insert time, where no review runs: the fail-closed person rule then does not apply. */
  reviewRequired?: boolean;
  /** Structured Look Ahead events to filter alongside the body. */
  events?: E[];
  /** Edition, city names: excluded from story matching because every section mentions them. */
  placeNames?: string[];
}

export interface ApplyResult<E extends ListingEvent = ListingEvent> {
  body: string;
  categories: unknown[];
  events: E[];
  removals: Removal[];
  decisions: StoryDecision[];
  keptStories: number;
  droppedStories: RuleStory[];
  changed: boolean;
}

function headerFor(u: Unit, parsed: ParsedBody): string {
  if (u.kind === 'section') return parsed.sections[u.sectionIndex].header;
  const words = stripLinks(u.text).replace(/\s+/g, ' ').trim().split(' ').slice(0, 10).join(' ');
  return u.kind === 'paragraph' ? `${parsed.sections[u.sectionIndex].header}: ${words}` : words;
}

function isGreetingOrSignoff(text: string): boolean {
  const words = stripLinks(text).trim().split(/\s+/).filter(Boolean).length;
  return words > 0 && words <= 12;
}

function isEventLine(line: string): boolean {
  return (line.match(/;/g) || []).length >= 2;
}

/** Unlink markdown links that point at a blocked source; the words stay. */
function unlinkBlocked(text: string, rules: EditionRules): { text: string; unlinked: string[] } {
  const unlinked: string[] = [];
  if (rules.blockedSources.length === 0) return { text, unlinked };
  const out = text.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (all, label: string, url: string) => {
    const hit = matchBlockedSource({ name: label, url }, rules.blockedSources);
    if (!hit) return all;
    unlinked.push(`${label} (${hit})`);
    return label;
  });
  return { text: out, unlinked };
}

function eventText(e: { name: string; category?: string | null; location?: string | null; address?: string | null }): string {
  return [e.name, e.category, e.location, e.address].filter(Boolean).join(' ');
}

function eventMatchesStory(text: string, m: StoryMatcher, story: RuleStory, exclude: Set<string>): boolean {
  if (scoreText(text, m) >= ASSIGN_THRESHOLD) return true;
  // The other direction: most of the event's own words appear in the story.
  const words = sigWords(text, exclude);
  if (words.length === 0) return false;
  const hay = ` ${normalizeName(`${story.entity} ${story.context}`)} `;
  return words.filter((w) => hay.includes(` ${w} `)).length / words.length >= 0.6;
}

/**
 * Keep a structured Look Ahead event only when a surviving story accounts for
 * it and no fixed topic rule fires. Events carry no source of their own, so a
 * listing entry stands on the story that verified it.
 */
function filterEventsAgainst<E extends ListingEvent>(
  events: E[],
  keptStories: RuleStory[],
  rules: EditionRules,
  placeNames: string[],
): { events: E[]; removals: Removal[] } {
  const exclude = new Set(placeNames.flatMap((p) => normalizeName(p).split(' ')).filter(Boolean));
  const matchers = buildMatchers(keptStories, placeNames);
  const removals: Removal[] = [];
  const out = events.filter((e) => {
    const t = eventText(e);
    const hits = topicHits(t, rules);
    const accounted = keptStories.some((s, i) => eventMatchesStory(t, matchers[i], s, exclude));
    if (hits.length === 0 && accounted) return true;
    removals.push({ header: `Listing: ${e.name}`, rule: hits[0] || 'listing-without-verified-story' });
    return false;
  });
  return { events: out, removals };
}

/** The Look Ahead listing filter, for events merged after enrichment. `categories` are the already-filtered ones. */
export function filterListingEvents<E extends ListingEvent>(
  events: E[],
  categories: unknown,
  rules: EditionRules,
  placeNames: string[] = [],
): { events: E[]; removals: Removal[] } {
  return filterEventsAgainst(events, flattenStories(categories), rules, placeNames);
}

/**
 * The deterministic filter. Removes blocked sources, drops stories that fail
 * the rules, removes their prose and any prose that no surviving story
 * accounts for, filters the Look Ahead listing, and rebuilds the body. With
 * nothing to remove the body comes back byte-for-byte unchanged, so running it
 * twice (at enrichment and again at insert) is safe.
 */
export function applyEditionRules<E extends ListingEvent = ListingEvent>(input: ApplyInput<E>): ApplyResult<E> {
  const { rules } = input;
  const placeNames = input.placeNames || [];
  const exclude = new Set(placeNames.flatMap((p) => normalizeName(p).split(' ')).filter(Boolean));
  const stories = flattenStories(input.categories);
  const parsed = parseBody(input.body || '');
  const units = unitsOf(parsed);
  const matchers = buildMatchers(stories, placeNames);
  const removals: Removal[] = [];

  // Map units to stories first, so the rules can read each story's own prose.
  const unitBest = units.map((u) => bestMatch(u.text, matchers));
  const proseByStory = new Map<number, string>();
  unitBest.forEach((b, i) => {
    if (b) proseByStory.set(b.index, [proseByStory.get(b.index), units[i].text].filter(Boolean).join('\n\n'));
  });

  const decisions = decideStories(stories, rules, input.verdicts ?? null, proseByStory, input.reviewRequired ?? true);
  const dropped = new Set(decisions.filter((d) => !d.keep).map((d) => d.index));
  const droppedMatchers = matchers.filter((m) => dropped.has(m.index));
  const keptMatchers = matchers.filter((m) => !dropped.has(m.index));

  for (const d of decisions) {
    for (const b of d.blockedSources) removals.push({ header: d.entity, rule: `blocked-source: ${b}` });
    if (!d.keep) removals.push({ header: d.entity, rule: d.rules[0] });
  }

  // Decide which units go.
  const removeUnit = new Set<number>();
  units.forEach((u, i) => {
    const b = unitBest[i];
    const contaminated = droppedMatchers.some((m) => scoreText(u.text, m) >= CONTAMINATION_THRESHOLD);
    if (b && dropped.has(b.index)) { removeUnit.add(i); return; }
    if (contaminated) {
      removeUnit.add(i);
      removals.push({ header: headerFor(u, parsed), rule: 'mentions-dropped-story' });
      return;
    }
    if (b) return;
    // Nothing verifiable accounts for this prose. A greeting or a sign-off is not a story.
    if (u.kind === 'preamble' && isGreetingOrSignoff(u.text)) return;
    removeUnit.add(i);
    removals.push({ header: headerFor(u, parsed), rule: 'no-verifiable-source' });
  });

  // A trailing sign-off inside the last non-date section survives on its own.
  let signoff: string | null = null;
  const lastSi = parsed.sections.length - 1;
  if (lastSi >= 0 && !parsed.sections[lastSi].isDate) {
    const last = parsed.sections[lastSi];
    const lastUnit = units.findIndex((u) => u.kind === 'section' && u.sectionIndex === lastSi);
    const tail = last.paragraphs[last.paragraphs.length - 1];
    if (lastUnit >= 0 && removeUnit.has(lastUnit) && last.paragraphs.length >= 2 && tail && isGreetingOrSignoff(tail)
      && !droppedMatchers.some((m) => scoreText(tail, m) >= ASSIGN_THRESHOLD)) {
      signoff = tail;
    }
  }

  // Listing lines: keep a line only when a surviving story accounts for it and
  // no fixed topic rule fires. A listing line carries no source of its own.
  let listing = parsed.listing;
  let listingChanged = false;
  if (listing) {
    const kept: string[] = [];
    let pendingDate: string | null = null;
    let eventsKept = 0;
    for (const line of listing.split('\n')) {
      const t = line.trim();
      const hdr = t.match(/^\[\[([^\]]+)\]\]$/);
      if (hdr && !/^event listing$/i.test(hdr[1].trim())) { pendingDate = line; continue; }
      if (isEventLine(t)) {
        const name = t.split(';')[0].trim();
        const hits = topicHits(t, rules);
        const accounted = stories.some((s) => !dropped.has(s.index) && eventMatchesStory(t, matchers[s.index], s, exclude));
        if (hits.length || !accounted) {
          listingChanged = true;
          removals.push({ header: `Listing: ${name}`, rule: hits[0] || 'listing-without-verified-story' });
          continue;
        }
        if (pendingDate !== null) { kept.push(pendingDate, ''); pendingDate = null; }
        kept.push(line, '');
        eventsKept++;
        continue;
      }
      if (/^-{3,}$/.test(t)) continue;
      if (t === '') continue;
      kept.push(line, '');
    }
    if (listingChanged) {
      listing = eventsKept > 0 ? `${kept.join('\n').trim()}\n\n---` : null;
    }
  }

  // Structured events (Look Ahead), same test as the listing lines.
  const events = filterEventsAgainst(input.events || [], stories.filter((s) => !dropped.has(s.index)), rules, placeNames).events;

  // Rebuild.
  const bodyChanged = removeUnit.size > 0 || listingChanged;
  let body = input.body || '';
  if (bodyChanged) {
    const parts: string[] = [];
    if (listing) parts.push(listing);
    units.forEach((u, i) => { if (u.kind === 'preamble' && !removeUnit.has(i)) parts.push(u.text); });
    parsed.sections.forEach((s, si) => {
      if (s.isDate) {
        const paras = s.paragraphs.filter((_, pi) => {
          const ui = units.findIndex((u) => u.kind === 'paragraph' && u.sectionIndex === si && u.paragraphIndex === pi);
          return ui < 0 || !removeUnit.has(ui);
        });
        if (paras.length) parts.push(`[[${s.header}]]`, ...paras);
      } else {
        const ui = units.findIndex((u) => u.kind === 'section' && u.sectionIndex === si);
        if (ui >= 0 && !removeUnit.has(ui) && s.paragraphs.length) parts.push(`[[${s.header}]]`, ...s.paragraphs);
      }
    });
    if (signoff) parts.push(signoff);
    body = parts.join('\n\n').trim();
  }
  const unlink = unlinkBlocked(body, rules);
  body = unlink.text;
  for (const u of unlink.unlinked) removals.push({ header: 'Link in body', rule: `blocked-source: ${u}` });

  // Categories: dropped stories out, blocked sources out of the survivors.
  const decisionByIndex = new Map(decisions.map((d) => [d.index, d]));
  let idx = 0;
  const categoriesOut: unknown[] = [];
  let categoriesChanged = false;
  if (Array.isArray(input.categories)) {
    for (const cat of input.categories as RawCategory[]) {
      const storiesOut: RawStory[] = [];
      for (const s of cat?.stories || []) {
        const entity = (s?.entity || '').trim();
        const context = (s?.context || '').trim();
        if (!entity && !context) continue;
        const d = decisionByIndex.get(idx++);
        if (!d || !d.keep) { categoriesChanged = true; continue; }
        const keep = (r: SourceRef | null | undefined) => (r && !matchBlockedSource(r, rules.blockedSources) ? r : null);
        const source = keep(s.source);
        const secondary = keep(s.secondarySource);
        if (source !== (s.source ?? null) || secondary !== (s.secondarySource ?? null)) categoriesChanged = true;
        const next: RawStory = { ...s, source: source ?? secondary };
        if (source && secondary) next.secondarySource = secondary; else delete next.secondarySource;
        storiesOut.push(next);
      }
      if (storiesOut.length) categoriesOut.push({ ...cat, stories: storiesOut });
      else if ((cat?.stories || []).length) categoriesChanged = true;
    }
  }

  return {
    body,
    categories: categoriesChanged || !Array.isArray(input.categories) ? categoriesOut : (input.categories as unknown[]),
    events,
    removals,
    decisions,
    keptStories: decisions.filter((d) => d.keep).length,
    droppedStories: stories.filter((s) => dropped.has(s.index)),
    changed: bodyChanged || unlink.unlinked.length > 0 || categoriesChanged || events.length !== (input.events || []).length,
  };
}

/**
 * Give single-source stories a second, independent source from the pages the
 * enrichment's Google Search grounding actually read, when one clearly matches
 * the story's subject. Mutates in place; returns how many were attached.
 */
export function attachSecondSources(
  categories: unknown,
  chunks: GroundingChunk[],
  rules: EditionRules,
): number {
  if (!Array.isArray(categories) || chunks.length === 0) return 0;
  let attached = 0;
  for (const cat of categories as RawCategory[]) {
    for (const s of cat?.stories || []) {
      if (!s?.source || s.secondarySource) continue;
      const primaryKey = sourceKey(s.source);
      const candidates = chunks.filter((c) => {
        const ref = { name: c.title || c.domain || c.uri, url: c.uri };
        return sourceKey(ref) !== primaryKey && !matchBlockedSource(ref, rules.blockedSources);
      });
      const subject = (s.entity || '').replace(/\s*\([^)]*\)/g, '').trim();
      const m = subject ? matchSourceToChunk(subject, candidates) : null;
      if (!m) continue;
      s.secondarySource = { name: m.title || m.domain || hostOf(m.uri) || m.uri, url: m.uri };
      attached++;
    }
  }
  return attached;
}

/** True when a teaser or headline is about a story that was dropped. */
export function mentionsDroppedStory(text: string | null | undefined, dropped: RuleStory[], placeNames: string[] = []): boolean {
  if (!text || dropped.length === 0) return false;
  const matchers = buildMatchers(dropped, placeNames);
  return matchers.some((m) => {
    if (scoreText(text, m) >= CONTAMINATION_THRESHOLD) return true;
    // Short teasers: any distinctive entity word is enough.
    const hay = ` ${normalizeName(text)} `;
    return m.entityWords.some((w) => w.length >= 5 && hay.includes(` ${w} `));
  });
}

/** Drop teaser sentences about dropped stories; null when nothing is left. */
export function filterTeaserSentences(text: string | null | undefined, dropped: RuleStory[], placeNames: string[] = []): string | null {
  if (!text) return text ?? null;
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  const kept = sentences.filter((s) => !mentionsDroppedStory(s, dropped, placeNames));
  const out = kept.join('').trim();
  return out.length >= 10 ? out : null;
}

/** A 1-4 word lowercase teaser from the first surviving story. */
export function fallbackTeaser(categories: unknown): string | null {
  const first = flattenStories(categories)[0];
  if (!first) return null;
  const words = first.entity.replace(/\s*\([^)]*\)/g, '').trim().split(/\s+/).slice(0, 4).join(' ');
  return words ? words.toLowerCase().slice(0, 40) : null;
}

/** One line per removal, for articles.editor_notes. Never starts with "Source:". */
export function formatRemovals(rules: EditionRules, removals: Removal[]): string | null {
  if (removals.length === 0) return null;
  const lines = removals.slice(0, 40).map((r) => `- "${r.header.replace(/\s+/g, ' ').slice(0, 120)}": ${r.rule}`);
  const more = removals.length > 40 ? `\n- and ${removals.length - 40} more` : '';
  return `Edition rules (${rules.label}) removed or changed ${removals.length} item(s):\n${lines.join('\n')}${more}`;
}

export interface InsertCheck {
  body: string;
  categories: unknown[];
  removals: Removal[];
  editorNotes: string | null;
  droppedStories: RuleStory[];
  /** Set when nothing publishable is left; the caller must not insert. */
  blockReason: string | null;
}

/**
 * The check every article insert runs for an edition with rules. Deterministic
 * and idempotent: a body the enricher already filtered comes back unchanged.
 * `priorRemovals` carries what the enricher removed, so editor_notes shows the
 * whole story. Returns null for an edition without rules.
 */
export function checkBeforeInsert(args: {
  neighborhoodId: string;
  body: string;
  categories: unknown;
  placeNames?: string[];
  priorRemovals?: Removal[];
}): InsertCheck | null {
  const rules = rulesForEdition(args.neighborhoodId);
  if (!rules) return null;
  if (flattenStories(args.categories).length === 0) {
    return {
      body: '', categories: [], removals: [], droppedStories: [],
      editorNotes: `Edition rules (${rules.label}): no structured stories to check, not published.`,
      blockReason: 'edition rules: no structured stories to verify',
    };
  }
  const r = applyEditionRules({
    body: args.body,
    categories: args.categories,
    rules,
    reviewRequired: false,
    placeNames: args.placeNames,
  });
  const removals = [...(args.priorRemovals || []), ...r.removals];
  return {
    body: r.body,
    categories: r.categories,
    removals,
    editorNotes: formatRemovals(rules, removals),
    droppedStories: r.droppedStories,
    blockReason: r.keptStories === 0 ? 'edition rules removed every story' : null,
  };
}
