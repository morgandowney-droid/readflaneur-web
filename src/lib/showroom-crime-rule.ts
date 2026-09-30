/**
 * The crime rule for showroom editions: crime and court stories may run, but
 * never naming anyone and never as the lead.
 *
 * Why (30 Sep 2026): on the AP call Morgan said the product steers clear of
 * crime, and that evening the editions AP and the Local Media Association read
 * showed otherwise. Clerkenwell named a stabbing victim, Shreveport led with a
 * named arrest in a child's shooting and named the child, and Warren's headline
 * came from a police pursuit. Morgan's rule: keep crime stories, with no names,
 * and never as the lead.
 *
 * Deterministic, and narrower than the publisher rules in edition-rules.ts,
 * which would also drop every unsourced story and unverified listing line:
 *  - a crime or court story (CRIME_OR_COURT) that names a person is dropped,
 *    story and section together, since removing a name reliably means removing
 *    the story;
 *  - an unnamed crime story is moved below every other story, in the body and
 *    in the categories;
 *  - a subject teaser (the headline) or email teaser drawn from a crime story
 *    is replaced from the first remaining story.
 * With nothing to change, everything comes back unchanged.
 */

import { CRIME_OR_COURT } from './sensitive-story-rules';
import { fallbackTeaser } from './edition-rules';

/** Editions shown to AP and the Local Media Association. */
export const SHOWROOM_CRIME_EDITION_IDS: ReadonlySet<string> = new Set([
  'newjersey-warren',
  'london-clerkenwell',
  'provence-gordes',
  'louisiana-shreveport',
]);

export function hasShowroomCrimeRule(editionId: string | null | undefined): boolean {
  return SHOWROOM_CRIME_EDITION_IDS.has((editionId || '').toLowerCase());
}

/** Capitalised words that are not a person's name. */
const NOT_A_NAME = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'on', 'in', 'at', 'from', 'for', 'and', 'but', 'with', 'after',
  'before', 'police', 'department', 'sheriff', 'office', 'county', 'parish', 'township', 'borough', 'city', 'town',
  'village', 'council', 'committee', 'board', 'court', 'district', 'state', 'federal', 'national', 'service',
  'weather', 'fire', 'rescue', 'metropolitan', 'met', 'street', 'road', 'avenue', 'drive', 'lane', 'boulevard',
  'place', 'square', 'park', 'bridge', 'interstate', 'highway', 'route', 'exit', 'station', 'school', 'high',
  'university', 'college', 'hospital', 'medical', 'center', 'centre', 'church', 'museum', 'library', 'market',
  'hall', 'house', 'north', 'south', 'east', 'west', 'new', 'old', 'upper', 'lower', 'great', 'saint', 'st',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march',
  'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'today', 'tonight',
  'section', 'crown', 'magistrates', 'supreme', 'appeals', 'investigation', 'investigators', 'detectives',
  'officers', 'authorities', 'prosecutors', 'attorney', 'district', 'news', 'radio', 'times', 'evening',
  'standard', 'press', 'associated', 'bbc', 'murder', 'shooting', 'stabbing', 'arrest', 'arrest', 'charges',
  'you', 'we', 'our', 'they', 'it', 'one', 'two', 'three', 'four', 'five', 'all', 'chase',
  'london', 'road', 'stolen', 'vehicle', 'pursuit', 'good', 'morning', 'update', 'crime', 'safety',
]);

function stripLinks(s: string): string {
  return s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

/**
 * Does the text name a person: two capitalised words in a row, neither a place,
 * an institution or a common word, and not part of the edition's place names.
 */
export function namesAPerson(text: string, placeNames: string[] = []): boolean {
  let clean = stripLinks(text);
  for (const p of placeNames) {
    for (const w of p.split(/[\s,()]+/).filter((x) => x.length > 1)) {
      clean = clean.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), ' ');
    }
  }
  // One space apart on one line: a header ending "Police Chase" and a
  // paragraph opening "You might..." are not a name (Warren, 30 Sep).
  const re = /\b([A-Z][a-zà-ÿ'’]+) ([A-Z][a-zà-ÿ'’]+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    const a = m[1].toLowerCase().replace(/['’]s$/, '');
    const b = m[2].toLowerCase().replace(/['’]s$/, '');
    if (NOT_A_NAME.has(a) || NOT_A_NAME.has(b)) { re.lastIndex = m.index + m[1].length + 1; continue; }
    return true;
  }
  return false;
}

export function isCrimeText(text: string): boolean {
  return CRIME_OR_COURT.test(stripLinks(text));
}

interface Story { entity?: string; context?: string; [k: string]: unknown }
interface Category { name?: string; stories?: Story[]; [k: string]: unknown }

export interface CrimeRuleInput {
  body: string;
  categories: unknown;
  subjectTeaser: string | null;
  emailTeaser: string | null;
  placeNames: string[];
}

export interface CrimeRuleResult {
  body: string;
  categories: unknown;
  subjectTeaser: string | null;
  emailTeaser: string | null;
  dropped: string[];
  movedDown: string[];
  teaserReplaced: boolean;
  changed: boolean;
}

const TEASER_STOP = new Set(['this', 'that', 'with', 'from', 'after', 'before', 'today', 'week', 'last', 'were', 'have', 'been', 'into', 'town', 'there', 'their', 'about', 'will', 'said']);

/** Words of four letters or more, for matching a teaser to the story it came from. */
function significantWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-zà-ÿ]{4,}/g) || []).filter((w) => !TEASER_STOP.has(w));
}

/** Apply the rule to a daily brief body and its stories. */
export function applyShowroomCrimeRule(input: CrimeRuleInput): CrimeRuleResult {
  const { placeNames } = input;
  const dropped: string[] = [];
  const movedDown: string[] = [];
  const crimeHeads: string[] = [];

  // Body: [[Header]] sections, one story each; date sections (a Look Ahead) are left alone.
  const lines = (input.body || '').split('\n');
  const preamble: string[] = [];
  const sections: Array<{ header: string; lines: string[] }> = [];
  for (const line of lines) {
    const m = line.match(/^\s*\[\[([^\]]+)\]\]\s*$/);
    if (m) sections.push({ header: m[1].trim(), lines: [] });
    else if (sections.length) sections[sections.length - 1].lines.push(line);
    else preamble.push(line);
  }
  const DATE_HEAD = /^(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|event listing)\b/i;
  let bodyChanged = false;
  let body = input.body || '';
  if (sections.length && !sections.some((s) => DATE_HEAD.test(s.header))) {
    // A short sign-off at the very end stays at the very end.
    const last = sections[sections.length - 1];
    const paras = last.lines.join('\n').trim().split(/\n\s*\n/);
    let signoff: string | null = null;
    if (paras.length >= 2 && paras[paras.length - 1].split(/\s+/).length <= 12 && !isCrimeText(paras[paras.length - 1])) {
      signoff = paras.pop()!;
      last.lines = paras.join('\n\n').split('\n');
    }
    const keep: typeof sections = [];
    const later: typeof sections = [];
    for (const s of sections) {
      const text = `${s.header}\n${s.lines.join('\n')}`;
      if (!isCrimeText(text)) { keep.push(s); continue; }
      crimeHeads.push(`${s.header} ${s.lines.join(' ').slice(0, 240)}`);
      if (namesAPerson(text, placeNames)) { dropped.push(s.header); continue; }
      later.push(s);
    }
    const order = [...keep, ...later];
    const reordered = later.length > 0 && keep.length > 0 && sections.indexOf(later[0]) < sections.indexOf(keep[keep.length - 1]);
    if (dropped.length || reordered) {
      bodyChanged = true;
      if (reordered) movedDown.push(...later.map((s) => s.header));
      const parts = [preamble.join('\n').trim(), ...order.map((s) => `[[${s.header}]]\n${s.lines.join('\n').trim()}`)];
      if (signoff) parts.push(signoff.trim());
      body = parts.filter(Boolean).join('\n\n');
    }
  }

  // Categories: named crime stories out, unnamed crime stories to the end.
  let categories = input.categories;
  let catsChanged = false;
  if (Array.isArray(input.categories)) {
    const plain: Category[] = [];
    const crimeTail: Story[] = [];
    let crimeCategory: string | null = null;
    for (const cat of input.categories as Category[]) {
      const kept: Story[] = [];
      for (const st of cat?.stories || []) {
        const text = `${st.entity || ''}\n${st.context || ''}`;
        if (!isCrimeText(text)) { kept.push(st); continue; }
        crimeHeads.push(`${st.entity || ''} ${String(st.context || '').slice(0, 240)}`);
        catsChanged = true;
        if (namesAPerson(text, placeNames)) { if (!dropped.includes(String(st.entity))) dropped.push(String(st.entity || '')); continue; }
        crimeTail.push(st);
        crimeCategory = crimeCategory || String(cat?.name || 'Safety');
      }
      if (kept.length) plain.push({ ...cat, stories: kept });
    }
    if (catsChanged) {
      if (crimeTail.length) plain.push({ name: crimeCategory || 'Safety', stories: crimeTail });
      categories = plain;
    }
  }

  // Teasers drawn from a crime story are replaced.
  const crimeWords = new Set(crimeHeads.flatMap(significantWords));
  const fromCrime = (t: string | null) => !!t && (isCrimeText(t) || significantWords(t).some((w) => crimeWords.has(w)));
  let subjectTeaser = input.subjectTeaser;
  let emailTeaser = input.emailTeaser;
  let teaserReplaced = false;
  if (crimeHeads.length && fromCrime(subjectTeaser)) {
    const firstPlain = Array.isArray(categories)
      ? (categories as Category[]).filter((c) => (c.stories || []).some((s) => !isCrimeText(`${s.entity || ''}\n${s.context || ''}`)))
      : [];
    subjectTeaser = fallbackTeaser(firstPlain) || null;
    teaserReplaced = true;
  }
  if (crimeHeads.length && fromCrime(emailTeaser)) {
    emailTeaser = null;
    teaserReplaced = true;
  }

  return {
    body,
    categories,
    subjectTeaser,
    emailTeaser,
    dropped,
    movedDown,
    teaserReplaced,
    changed: bodyChanged || catsChanged || teaserReplaced,
  };
}
