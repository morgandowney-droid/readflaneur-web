/**
 * Tiered sourcing standard (SHADOW ONLY; nothing that publishes reads this).
 *
 * Why tiered: a shadow run of the flat "two sources for every named fact"
 * rule (edition-rules.ts, requireTwoSourcesForNamedFacts) would have cut
 * 84-98% of stories, because almost every local story is one venue, one
 * organiser or one council page. The owner approved a standard that scales
 * with what a mistake would cost:
 *
 *  - LOW stakes (openings, menus, events, markets, works, council agendas,
 *    culture): ONE confirmed source, of an acceptable kind.
 *  - HIGH stakes (a private individual, crime, courts, police, death, injury,
 *    accident, allegations, health claims, money disputes or fraud, a
 *    contested or political claim): TWO confirmed sources on different
 *    registrable domains or accounts, OR one confirmed official source (a
 *    public body) or newspaper of record.
 *
 * "Confirmed" means the page was fetched and the deterministic fact matcher
 * (source-check.ts) found the story on it: verdict verified, or partial with
 * the story's subject on the page. A URL the writing model supplied (origin
 * 'model') is never confirmed, whatever the page says.
 *
 * Stakes are classified in code with no model call: the fixed crime and
 * death rules shared with the editor desk (sensitive-story-rules.ts), a few
 * more fixed patterns below, and, when the editor desk has already run on
 * the brief, its stored flag (story-flags.ts), which is read, never requested.
 *
 * Pure: relative imports of pure modules only, so scripts/test-source-standard.mjs
 * can compile and test it without the app.
 */
import { sensitiveRuleHits, MINORS } from './sensitive-story-rules';
import { hostOf, isNewspaperOfRecord, isSocialSource, registrableDomain, sourceKey } from './edition-rules';
import { hostMatchesPublication, isHttpUrl, type SourceRef } from './source-links';
import type { CheckVerdict, FactKind } from './source-check';

// ─── Stakes ────────────────────────────────────────────────────────────────

export type Stakes = 'high' | 'low';

export type StakesReason =
  | 'crime-or-court'
  | 'death-or-injury'
  | 'private-individual'
  | 'allegation'
  | 'health-claim'
  | 'money-dispute'
  | 'contested'
  | 'flag-sensitive'
  | 'flag-controversy';

/**
 * A private individual described as one: an age, a relationship, "local
 * man", "named locally as". A bare capitalised name is not enough (every
 * venue and chef would qualify); a councillor or mayor acting in office is a
 * public figure and not caught here.
 */
const PRIVATE_INDIVIDUAL = /\b(\d{1,2}[- ]year[- ]old|aged \d{1,2}|\d{1,2}[- ]j[äa]hrige[rn]?|\d{1,2} anni\b|\d{1,2} años|local (man|woman|resident|boy|girl|teenager|couple|family|mother|father|mum|dad)|(a|the) (man|woman|boy|girl|teenager|pensioner|motorist|driver|cyclist|pedestrian) (was|has been|who)|named (locally )?as|family of|widow(er)?|next of kin|the deceased|his (wife|partner|family)|her (husband|partner|family))\b/i;
/**
 * "John Murphy, 34, of ..." : a first and last name followed by an age.
 * Case-sensitive. An address is not a person: "Calle Serrano, 40," and
 * "Main Street, 12," are house numbers.
 */
const NAME_WITH_AGE = /\b(\p{Lu}\p{Ll}+) (\p{Lu}[\p{Ll}'’-]+),\s?\d{2},\s/gu;
const ADDRESS_WORDS = /^(calle|carrer|via|viale|corso|piazza|largo|rue|avenue|avenida|plaza|pra[cç]a|rua|stra(ss|ß)e|gasse|platz|weg|street|road|lane|drive|square|terrace|place|close|crescent|way|hill|quay|row|parade)$/i;
function nameWithAge(text: string): boolean {
  for (const m of text.matchAll(NAME_WITH_AGE)) {
    if (!ADDRESS_WORDS.test(m[1]) && !ADDRESS_WORDS.test(m[2])) return true;
  }
  return false;
}

/** Allegations: somebody says somebody did something wrong. */
const ALLEGATION = /\b(alleg\w*|accus\w*|claim(s|ed)? (that )?(he|she|they|the (company|owner|council|landlord|operator))|denie[sd]|deny(ing)?|lawsuits?|sued|suing|legal action|complaints? (against|about|to the ombudsman)|investigation into|probe into|whistleblow\w*|misconduct|harass\w*|discriminat\w*|vorw[üu]rf\w*|beschuldig\w*|denuncia\w*|accusa\w*)\b/i;

/** Health claims: outbreaks, contamination, a named disease, a cure. */
const HEALTH_CLAIM = /\b(outbreak|contaminat\w*|food poisoning|e\. ?coli|salmonella|listeria|legionell\w*|norovirus|measles|meningitis|tuberculosis|covid|coronavirus|infections? (spread|rise|cases)|pandemic|epidemic|miracle cure|cures? (for )?(cancer|diabetes|arthritis|depression)|health (risk|scare|warning|alert)|boil (water )?notice|do not drink|toxic|carcinogen\w*|asbestos|unsafe to (eat|drink|swim)|bathing (ban|prohibition)|recall(ed)? (over|due to|because))\b/i;

/** Money disputes and failures: debts, insolvency, scams, evictions. */
const MONEY_DISPUTE = /\b(fraud\w*|scam\w*|embezzl\w*|unpaid|owed|owes|arrears|debts?|insolven\w*|bankrupt\w*|liquidat\w*|receivership|examinership|administration order|went into administration|wage theft|evict\w*|repossess\w*|compensation claim|refund (row|dispute)|money laundering|tax evasion|insolvenz\w*|konkurs\w*|pleite|quiebra|fallimento)\b/i;

/**
 * Contested and political claims: open disputes, protests, campaigns,
 * elections. A council agenda item or an approved plan with no dispute stays
 * LOW; an objection, a protest or a row makes it HIGH.
 */
const CONTESTED = /\b(protest\w*|objectors?|objections? (to|against|lodged|from)|opposed|opposition to|row over|rows? (between|with)|dispute[sd]?|controvers\w*|backlash|outrage|furious|condemn\w*|petition\w*|campaigners?|appeal(ed)? against|judicial review|legal challenge|election\w*|candidates?|political part(y|ies)|party leader|referendum|no confidence|resign\w*|sacked|ousted|scandal|widerstand|protesta\w*|polémica|polemica)\b/i;

export interface StakesInput {
  entity?: string | null;
  context?: string | null;
  category?: string | null;
  /** The editor desk's stored flag for this story (neighborhood_briefs.story_flags), when it has run. Read, never requested. */
  flag?: { sensitive?: boolean; reasons?: string[] } | null;
}

export interface StakesResult {
  stakes: Stakes;
  reasons: StakesReason[];
}

/** Deterministic stakes for one story. No model call. */
export function classifyStakes(story: StakesInput): StakesResult {
  const title = (story.entity || '').trim();
  const summary = (story.context || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
  const text = `${title}\n${summary}`;
  const reasons = new Set<StakesReason>();
  for (const hit of sensitiveRuleHits({ title, summary })) {
    if (hit === 'crime-or-court' || hit === 'death-or-injury') reasons.add(hit);
    if (hit === 'minors') reasons.add('private-individual');
  }
  if (PRIVATE_INDIVIDUAL.test(text) || nameWithAge(text)) reasons.add('private-individual');
  if (ALLEGATION.test(text)) reasons.add('allegation');
  if (HEALTH_CLAIM.test(text)) reasons.add('health-claim');
  if (MONEY_DISPUTE.test(text)) reasons.add('money-dispute');
  if (CONTESTED.test(text)) reasons.add('contested');
  // A child named alongside anything above is a private individual.
  if (reasons.size > 0 && MINORS.test(text)) reasons.add('private-individual');
  if (story.flag?.sensitive) reasons.add('flag-sensitive');
  if (story.flag?.reasons?.includes('controversy')) reasons.add('flag-controversy');
  return { stakes: reasons.size > 0 ? 'high' : 'low', reasons: [...reasons] };
}

// ─── Source kinds ──────────────────────────────────────────────────────────

/**
 * What a source page is, for the standard:
 *  - official: a public body (government domain, or a council, police force,
 *    ministry or municipality on its own host)
 *  - record: a newspaper of record for the edition's country (edition-rules.ts)
 *  - primary: the subject's own page (venue, organiser, business) or its own
 *    social account, or the organiser's ticketing page
 *  - outlet: any other site that is not social and not low-trust (a local
 *    paper, a trade title, a magazine)
 *  - social: someone else's social account or post
 *  - low-trust: aggregators, directories, review sites, encyclopaedias and
 *    search pages, which restate other pages and confirm nothing on their own
 */
export type StandardSourceKind = 'official' | 'record' | 'primary' | 'outlet' | 'social' | 'low-trust';

const GOV_HOST = /(^|\.)(gov|gouv|gob|govt|gv|gc|gub)\.[a-z]{2}$|\.gov$|\.mil$|(^|\.)(europa\.eu|police\.uk|garda\.ie|hse\.ie|courts\.ie|oireachtas\.ie|parliament\.uk|bundestag\.de|parlament\.gv\.at|senato\.it|camera\.it|congreso\.es|legislation\.gov\.uk)$/;
const MUNICIPAL_HOST = /(^|[.-])(council|countycouncil|citycouncil|gemeinde|marktgemeinde|stadtgemeinde|landkreis|comune|ayuntamiento|ajuntament|mairie|municipio|municipality|kommun|kommune)([.-]|$)|^(comune|gemeinde|stadt|ayto|concello)\.|(coco|cityco|council)\.ie$/;
const PUBLIC_BODY_NAME = /\b(council|county council|city council|borough|garda|police|polizei|constabulary|ministry|ministerium|department of|government|gemeinde|stadt|marktgemeinde|stadtgemeinde|landkreis|bezirkshauptmannschaft|land vorarlberg|comune di|ayuntamiento|ajuntament|mairie|prefecture|pr[ée]fecture|municipality|city of|town of|district of|province of|state of|hse|health service executive|courts service|parliament|oireachtas|transport for|national park|fire (and rescue )?service|feuerwehr|ambulance service)\b/i;

const TICKETING_HOST = /(^|\.)(eventbrite\.[a-z.]+|ticketmaster\.[a-z.]+|ticketsolve\.com|eventim\.[a-z.]+|oeticket\.com|seetickets\.com|dice\.fm|universe\.com|trybooking\.com|humanitix\.com|tito\.io|entradas\.com|ticketone\.it|billetweb\.fr|fnacspectacles\.com|ticketek\.com\.au|ticketweb\.[a-z.]+|skiddle\.com|ents24\.com)$/;

const LOW_TRUST_HOST = /(^|\.)(wikipedia\.org|wikiwand\.com|tripadvisor\.[a-z.]+|yelp\.[a-z.]+|allevents\.in|eventseeker\.com|happeningnext\.com|stayhappening\.com|evendo\.com|10times\.com|concertful\.com|songkick\.com|bandsintown\.com|whatsonwhen\.com|eventbu\.com|local\.com|newsbreak\.com|ground\.news|google\.[a-z.]+|bing\.com|duckduckgo\.com|yellowpages\.[a-z.]+|goldenpages\.ie|mapquest\.com|foursquare\.com|restaurantguru\.com|wanderlog\.com|trip\.com|booking\.com|expedia\.[a-z.]+|opentable\.[a-z.]+|thefork\.[a-z.]+|timeanddate\.com|weather\.com|zomato\.com)$/;

export function standardSourceKind(ref: SourceRef, ctx: { entity?: string | null; recordCountry?: string }): StandardSourceKind {
  const url = isHttpUrl(ref.url) ? ref.url.trim() : null;
  const host = hostOf(url);
  const entity = (ctx.entity || '').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (host && LOW_TRUST_HOST.test(host)) return 'low-trust';
  if (host && GOV_HOST.test(host)) return 'official';
  if (ctx.recordCountry && isNewspaperOfRecord(ref, ctx.recordCountry)) return 'record';
  if (isSocialSource(ref)) {
    // The subject's own account ("@shepparton_art_museum" for Shepparton Art Museum).
    const handle = (url ? url.replace(/^https?:\/\/[^/]+\/(groups\/|pages\/)?/i, '').split(/[/?#]/)[0] : ref.name).replace(/^@/, '');
    return entity && socialHandleMatches(handle, entity) ? 'primary' : 'social';
  }
  if (!host) return 'outlet';
  if (MUNICIPAL_HOST.test(host)) return 'official';
  if (PUBLIC_BODY_NAME.test(ref.name || '') && url && hostMatchesPublication(ref.name, url)) return 'official';
  if (TICKETING_HOST.test(host)) return 'primary';
  if (entity && url && hostMatchesPublication(entity, url)) return 'primary';
  return 'outlet';
}

function compactLetters(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** A handle is the subject's own when the subject's letters run inside it or vice versa (at least 5 letters). */
export function socialHandleMatches(handle: string, entity: string): boolean {
  const h = compactLetters(handle);
  if (h.length < 4) return false;
  const words = entity.split(/\s+/).map(compactLetters).filter((w) => w.length >= 4);
  const whole = compactLetters(entity);
  if (whole.length >= 5 && (h.includes(whole) || (h.length >= 5 && whole.includes(h)))) return true;
  // Every significant word of the subject in the handle ("Riverside Cafe" -> riversidecafe_ltd).
  return words.length > 0 && words.every((w) => h.includes(w));
}

// ─── Confirmation ──────────────────────────────────────────────────────────

/** One source's check, as stored in story_source_checks (or computed in-process). */
export interface CheckedSource {
  name: string | null;
  url: string;
  /** SourceOrigin, 'second-search' for a page the shadow second-source search found, or 'unknown'. */
  origin: string | null;
  verdict: CheckVerdict;
  /** Facts the matcher found on the page; only `kind` is read. */
  matched?: Array<{ kind: FactKind | string }> | null;
}

/**
 * Confirmed: the page was read and says what the story says. Verified, or
 * partial with the story's subject on the page. A model-written URL is never
 * confirmed.
 */
export function isConfirmed(c: CheckedSource): boolean {
  if (!isHttpUrl(c.url) || c.origin === 'model') return false;
  if (c.verdict === 'verified') return true;
  return c.verdict === 'partial' && !!c.matched?.some((f) => f.kind === 'entity');
}

// ─── The standard ──────────────────────────────────────────────────────────

export type StandardFailure =
  | 'no-confirmed-source'
  | 'only-unacceptable-sources'
  | 'high-needs-second-independent-source';

export interface ConfirmedSourceSummary {
  url: string;
  kind: StandardSourceKind;
  key: string;
}

export interface StandardDecision {
  stakes: Stakes;
  reasons: StakesReason[];
  meets: boolean;
  /** How it met the standard: one-source (LOW), two-independent, official, record. */
  basis: 'one-source' | 'two-independent' | 'official' | 'record' | null;
  failure: StandardFailure | null;
  confirmed: ConfirmedSourceSummary[];
  /** Distinct independent confirmed sources of an acceptable kind. */
  independentCount: number;
}

// The same kinds count at both tiers. The subject's own social account is
// 'primary'; another person's post ('social') and aggregators ('low-trust')
// never confirm anything on their own.
const ACCEPTABLE: StandardSourceKind[] = ['official', 'record', 'primary', 'outlet'];

/**
 * Apply the tiered standard to one story. Pure: the checks are passed in.
 */
export function decideStandard(
  story: StakesInput,
  checks: CheckedSource[],
  ctx: { recordCountry?: string } = {},
): StandardDecision {
  const { stakes, reasons } = classifyStakes(story);
  const confirmedAll = checks.filter(isConfirmed).map((c) => {
    const ref: SourceRef = { name: c.name || hostOf(c.url) || c.url, url: c.url };
    return { url: c.url, kind: standardSourceKind(ref, { entity: story.entity, recordCountry: ctx.recordCountry }), key: independenceKey(ref) };
  });
  const base = { stakes, reasons, confirmed: confirmedAll };
  if (confirmedAll.length === 0) {
    return { ...base, meets: false, basis: null, failure: 'no-confirmed-source', independentCount: 0 };
  }
  const acceptable = confirmedAll.filter((c) => ACCEPTABLE.includes(c.kind));
  const independent = new Set(acceptable.map((c) => c.key));
  if (acceptable.length === 0) {
    return { ...base, meets: false, basis: null, failure: 'only-unacceptable-sources', independentCount: 0 };
  }
  if (stakes === 'low') {
    return { ...base, meets: true, basis: 'one-source', failure: null, independentCount: independent.size };
  }
  if (acceptable.some((c) => c.kind === 'official')) {
    return { ...base, meets: true, basis: 'official', failure: null, independentCount: independent.size };
  }
  if (acceptable.some((c) => c.kind === 'record')) {
    return { ...base, meets: true, basis: 'record', failure: null, independentCount: independent.size };
  }
  if (independent.size >= 2) {
    return { ...base, meets: true, basis: 'two-independent', failure: null, independentCount: independent.size };
  }
  return { ...base, meets: false, basis: null, failure: 'high-needs-second-independent-source', independentCount: independent.size };
}

/** Independence: registrable domain, or platform + account for social (edition-rules sourceKey). */
export function independenceKey(ref: SourceRef): string {
  return sourceKey(ref);
}

/**
 * A HIGH story that a second source would carry over the line: exactly one
 * independent confirmed source, and it is not official or a paper of record.
 */
export function needsSecondSource(d: StandardDecision): boolean {
  return d.stakes === 'high' && !d.meets && d.failure === 'high-needs-second-independent-source' && d.independentCount === 1;
}

// ─── Second-source candidates ──────────────────────────────────────────────

/**
 * May a page the second-source search returned stand as the second source?
 * It must be an http page, on a different registrable domain from every
 * source the story already has, not social, not low-trust, and not a
 * section front or listing (the caller passes isListingUrl from
 * source-repair.ts so this module stays free of it).
 */
export function acceptableSecondCandidate(
  url: string,
  existingUrls: string[],
  isListing: (u: string) => boolean,
): boolean {
  if (!isHttpUrl(url)) return false;
  const host = hostOf(url);
  if (!host) return false;
  if (LOW_TRUST_HOST.test(host)) return false;
  if (isSocialSource({ name: host, url })) return false;
  if (isListing(url)) return false;
  const dom = registrableDomain(host);
  return !existingUrls.some((u) => {
    const h = hostOf(u);
    return !!h && registrableDomain(h) === dom;
  });
}

// ─── Summaries ─────────────────────────────────────────────────────────────

export interface StandardStoryRow {
  stakes: Stakes;
  meets: boolean;
  second_tried: boolean;
  second_found: boolean;
  meets_after_second: boolean;
}

export interface StandardTally {
  stories: number;
  meets: number;
  cut: number;
  meets_pct: number;
  high: { stories: number; meets: number; cut: number; second_tried: number; second_found: number; meets_after_second: number; cut_after_second: number };
  low: { stories: number; meets: number; cut: number };
  meets_after_second: number;
  cut_after_second: number;
  meets_after_second_pct: number;
}

export function tallyStandard(rows: StandardStoryRow[]): StandardTally {
  const high = rows.filter((r) => r.stakes === 'high');
  const low = rows.filter((r) => r.stakes === 'low');
  const meets = rows.filter((r) => r.meets).length;
  const after = rows.filter((r) => r.meets_after_second).length;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const hm = high.filter((r) => r.meets).length;
  const ha = high.filter((r) => r.meets_after_second).length;
  const lm = low.filter((r) => r.meets).length;
  return {
    stories: rows.length,
    meets,
    cut: rows.length - meets,
    meets_pct: pct(meets, rows.length),
    high: {
      stories: high.length, meets: hm, cut: high.length - hm,
      second_tried: high.filter((r) => r.second_tried).length,
      second_found: high.filter((r) => r.second_found).length,
      meets_after_second: ha, cut_after_second: high.length - ha,
    },
    low: { stories: low.length, meets: lm, cut: low.length - lm },
    meets_after_second: after,
    cut_after_second: rows.length - after,
    meets_after_second_pct: pct(after, rows.length),
  };
}

// ─── A whole brief ─────────────────────────────────────────────────────────

/** One story_source_checks row, as the shadow check stored it. */
export interface StoredCheckRow {
  story_index: number;
  source_name: string | null;
  source_url: string;
  source_origin: string | null;
  verdict: CheckVerdict;
  matched_facts: Array<{ kind: string }> | null;
}

export interface BriefStoryInput {
  index: number;
  entity: string;
  context: string;
  category?: string;
}

export interface BriefStoryDecision {
  index: number;
  entity: string;
  context: string;
  /** False when the shadow check has no row for this story (not measured). */
  checked: boolean;
  checks: CheckedSource[];
  decision: StandardDecision;
}

/**
 * The standard for every story of one brief, from the shadow check's stored
 * rows and (when present) the editor desk's stored flags. Pure.
 */
export function evaluateBrief(
  stories: BriefStoryInput[],
  rows: StoredCheckRow[],
  opts: { flags?: Array<{ index: number; sensitive?: boolean; reasons?: string[] }> | null; recordCountry?: string } = {},
): BriefStoryDecision[] {
  const flagByIndex = new Map((opts.flags || []).map((f) => [f.index, f]));
  return stories.map((s) => {
    const own = rows.filter((r) => r.story_index === s.index);
    const checks: CheckedSource[] = own
      .filter((r) => isHttpUrl(r.source_url))
      .map((r) => ({ name: r.source_name, url: r.source_url, origin: r.source_origin, verdict: r.verdict, matched: r.matched_facts }));
    const decision = decideStandard(
      { entity: s.entity, context: s.context, category: s.category, flag: flagByIndex.get(s.index) || null },
      checks,
      { recordCountry: opts.recordCountry },
    );
    return { index: s.index, entity: s.entity, context: s.context, checked: own.length > 0, checks, decision };
  });
}
