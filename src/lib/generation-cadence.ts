/**
 * Generation cadence gate (AI cost control).
 *
 * Daily content (briefs + Look Aheads) is generated for ~301 active
 * neighborhoods, but only ~12 have any subscriber. Generating daily content
 * for the ~256 "cold" neighborhoods (no subscriber, not Irish syndication) is
 * the single biggest AI cost with no reader.
 *
 * This gate keeps daily generation for subscribed neighborhoods and the 33
 * Irish syndication entities (ie-*, feeding yous.news), and drops cold
 * neighborhoods to once every COLD_INTERVAL_DAYS. A deterministic
 * per-neighborhood bucket spreads the cold set evenly across the interval
 * (~1/4 per day) instead of regenerating all of them on the same day.
 *
 * When a cold neighborhood gains its first subscriber it returns to daily
 * automatically - the gate reads live subscriber state every run.
 */

import { LICENSED_EDITION_IDS } from './licensees';

export const COLD_INTERVAL_DAYS = 7;

/** djb2 string hash - deterministic, stable across runs. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Days since the Unix epoch for a 'YYYY-MM-DD' date string. */
function dayNumber(localDate: string): number {
  return Math.floor(Date.parse(`${localDate}T00:00:00Z`) / 86_400_000);
}

/** Irish counties + national Ireland (ie-*) are syndicated to yous.news. */
export function isIrishEntity(neighborhoodId: string): boolean {
  return neighborhoodId.startsWith('ie-');
}

/**
 * Publisher pilot neighborhoods: places a prospective publisher customer has
 * asked to see running before a call. They have no subscriber yet but must
 * get the full daily treatment. Add ids here when a pilot is agreed; remove
 * them when it ends. Region 'test' keeps them out of lists and the sitemap.
 */
export const PILOT_NEIGHBORHOOD_IDS: ReadonlySet<string> = new Set([
  // Funke Regionalmedien, Germany (named by Carsten Gross, 2026-09-11)
  'sauerland-balve',
  'thueringen-drei-gleichen',
  'hamburg-eppendorf',
  // Newsquest, UK South Coast (one district per masthead, 2026-09-11):
  // Bournemouth Echo, Southern Daily Echo and The Argus
  'dorset-christchurch',
  'hampshire-lymington',
  'sussex-lewes',
  // Newsquest follow-up (2026-09-14 call): Birmingham as a whole city and as one
  // district, because they were unsure which unit they wanted; East Kilbride as
  // an expansion market with no Newsquest title; Helston for Simon's Cornwall patch.
  'westmidlands-birmingham',
  'birmingham-sutton-coldfield',
  'birmingham-moseley',
  'birmingham-kings-heath',
  'birmingham-harborne',
  'birmingham-erdington',
  'birmingham-digbeth',
  'lanarkshire-east-kilbride',
  'cornwall-helston',
  // PA Media (2026-09-16 call): Jack Lefley named Haringey himself, as the
  // London borough he is from. Built at both units, the borough and two of its
  // neighbourhoods, because the unit question is the one PA has to answer
  // before it can price anything.
  'london-haringey',
  'haringey-tottenham',
  'haringey-crouch-end',
  // AMI, the Spanish news publishers' association (2026-09-21): Irene
  // Lanzaco's office named Zaragoza for a meeting in October. Built as the
  // whole city and two of its districts, the Birmingham and Haringey pattern,
  // so the meeting can compare units. Promised in writing to run in Spanish.
  'aragon-zaragoza',
  'zaragoza-casco-historico',
  'zaragoza-delicias',
  // AAP, Australia (2026-09-21): Andrew Drummond named two Local Government
  // Areas himself, one in Victoria and one in Queensland, for a call on
  // 29 October. Deliberately built five weeks early so the archive is deep by
  // the time three AAP editors look at it.
  //
  // DO NOT REMOVE BEFORE 29 OCTOBER 2026. The country-wave showcases below
  // carry a "review for removal after 2026-10-15" note, and these two sit two
  // weeks the wrong side of it. The whole argument made to AAP in writing is
  // that they can read thirty-five consecutive mornings rather than a demo, so
  // a gap in the archive is the one thing that cannot be repaired later.
  'victoria-greater-shepparton',
  'queensland-charters-towers',
  // Overstory Media Group, British Columbia (2026-09-16): Shannon Havard named
  // Chilliwack, Langley and Abbotsford. Fraser Valley cities between Overstory's
  // existing titles, all well above the 25,000 the unit is sized for.
  'fraservalley-chilliwack',
  'fraservalley-langley',
  'fraservalley-abbotsford',
  // Country-wave showcases (2026-09-15): one live edition per market so a cold
  // email to a French, Italian, Spanish, Canadian, Australian or New Zealand
  // publisher can link to this morning's edition in the reader's language.
  // Existing public neighbourhoods, promoted to daily generation for the wave.
  // Review for removal after 2026-10-15 (about $0.50-1.00/day each).
  'paris-le-marais',
  'milan-navigli',
  'madrid-salamanca',
  // Missed in the original wave, found 2026-09-16: the Lusa draft links to
  // Chiado as proof the engine writes Portuguese daily, and on the cold cycle
  // it was 42 hours stale.
  'lisbon-chiado',
  'montreal-westmount',
  'sydney-paddington',
  'auckland-remuera',
  'toronto-yorkville',
  // Neutral German-language showcase: the German pilot towns above were named by
  // a live prospect, so cold outreach to other German-speaking publishers links
  // this one instead.
  'berlin-prenzlauer-berg',
  // The Canadian Press (named by Malcolm Kirk, 2026-09-17) ahead of the 21 Sep
  // call. He picked both and called them local news deserts, which is precisely
  // the case the product exists to answer. English, so no PILOT_LANGUAGES entry.
  'newfoundland-gander',
  'newfoundland-corner-brook',
  // Russmedia (named by Simon Mathis, Head of AI Studio, 2026-09-18) ahead of
  // the 22 Sep call. Lochau is about 5,800 on its own, under the floor, so the
  // catchment is drawn at 4km to take in the Leiblachtal without letting
  // Bregenz dominate and turn it into an edition about Bregenz.
  'vorarlberg-lochau',
  // Russmedia after the 22 Sep call: Simon Mathis drew ten areas of 25,000 to
  // 30,000 people across Vorarlberg himself, the unit exactly as pitched, for a
  // free test of a month or two. Their own hyperlocal project kicks off the week
  // of 28 Sep and he comes back around 30 Sep; editions do not backfill, so every
  // morning before then is archive he can show. Lochau (above) sits inside
  // area two and keeps running.
  'vorarlberg-bregenz',
  'vorarlberg-leiblachtal',
  'vorarlberg-rheindelta',
  'vorarlberg-lauterach-wolfurt',
  'vorarlberg-dornbirn-nordwest',
  'vorarlberg-dornbirn-suedost',
  'vorarlberg-hohenems',
  'vorarlberg-goetzis-vorderland',
  'vorarlberg-rankweil',
  'vorarlberg-arlberg-klostertal',
  // GEDI (named by Mirja Cartia d'Asero, 2026-09-22) ahead of the 23 Sep call,
  // on Will Lewis's introduction for Repubblica's city editions. Was cold
  // (weekly brief, no Look Ahead); promoted the morning of the call.
  'milan-brera',
  // GEDI after the 23 Sep call: Mirja Cartia d'Asero named Scicli, the Sicilian
  // town she is from, and Prati in Rome, where Repubblica's editor-in-chief
  // lives. A third quartiere is to come from the head of digital. She asked
  // whether it could be live for 1 November, so these start the archive now.
  'sicily-scicli',
  'rome-prati',
  // The third, named by Veronica Diquattro (CEO GEDI Digital from 1 Oct) via
  // Mirja the same day.
  'milan-porta-venezia',
  // AP (named by Paul Shanley, Senior Director of Strategy, 2026-09-24) ahead
  // of the 30 Sep call: Warren Township, Somerset County, about 16,000 people.
  // Warren, Michigan (140,000) and Warren, Ohio outrank it in any search, so
  // the catchment carries the county and the Look Ahead is geofenced.
  'newjersey-warren',
]);

/** The language a pilot publisher reads in; translations are pre-warmed in it. */
export const PILOT_LANGUAGES: Readonly<Record<string, 'sv' | 'fr' | 'de' | 'es' | 'pt' | 'it' | 'zh' | 'ja'>> = {
  'sauerland-balve': 'de',
  'thueringen-drei-gleichen': 'de',
  'hamburg-eppendorf': 'de',
  // Country-wave showcases (2026-09-15)
  'paris-le-marais': 'fr',
  'milan-navigli': 'it',
  'madrid-salamanca': 'es',
  'lisbon-chiado': 'pt',
  // AMI, Spain (2026-09-21)
  'aragon-zaragoza': 'es',
  'zaragoza-casco-historico': 'es',
  'zaragoza-delicias': 'es',
  'montreal-westmount': 'fr',
  'berlin-prenzlauer-berg': 'de',
  'vorarlberg-lochau': 'de',
  // Russmedia's ten areas (2026-09-22)
  'vorarlberg-bregenz': 'de',
  'vorarlberg-leiblachtal': 'de',
  'vorarlberg-rheindelta': 'de',
  'vorarlberg-lauterach-wolfurt': 'de',
  'vorarlberg-dornbirn-nordwest': 'de',
  'vorarlberg-dornbirn-suedost': 'de',
  'vorarlberg-hohenems': 'de',
  'vorarlberg-goetzis-vorderland': 'de',
  'vorarlberg-rankweil': 'de',
  'vorarlberg-arlberg-klostertal': 'de',
  // GEDI / Repubblica (2026-09-23)
  'milan-brera': 'it',
  'sicily-scicli': 'it',
  'rome-prati': 'it',
  'milan-porta-venezia': 'it',
};

export function isPilotNeighborhood(neighborhoodId: string): boolean {
  return PILOT_NEIGHBORHOOD_IDS.has(neighborhoodId);
}

/**
 * A "priority" neighborhood has a real audience: it either has a subscriber,
 * is an Irish syndication entity (feeding yous.news), or is a publisher pilot. Priority neighborhoods get
 * the full treatment - daily generation, Grok+Gemini dual-source search, Pro
 * enrichment, Look Ahead, and the Sunday Edition. Cold (non-priority)
 * neighborhoods get a lean Gemini-only Daily Brief every COLD_INTERVAL_DAYS,
 * Flash-enriched, with no Look Ahead or Sunday Edition. Used across the
 * generation crons to match AI spend to actual demand.
 */
export function isPriorityNeighborhood(
  neighborhoodId: string,
  subscribed: boolean,
): boolean {
  return subscribed || isIrishEntity(neighborhoodId) || isPilotNeighborhood(neighborhoodId)
    // A licensee reads the edition through /api/v1 every morning. Left cold it
    // would publish one day in seven and the feed would be empty the other six.
    || LICENSED_EDITION_IDS.has(neighborhoodId);
}

/**
 * Whether a neighborhood should have daily content generated for the given
 * local date.
 *
 * @param neighborhoodId - neighborhood ID
 * @param localDate      - the neighborhood's local date, 'YYYY-MM-DD'
 * @param subscribed     - true if the neighborhood has >=1 subscriber
 * @returns true for subscribed, Irish and pilot neighborhoods (always), or for cold
 *   neighborhoods only on their bucketed day (every COLD_INTERVAL_DAYS).
 */
export function shouldGenerateToday(
  neighborhoodId: string,
  localDate: string,
  subscribed: boolean,
): boolean {
  if (isPriorityNeighborhood(neighborhoodId, subscribed)) return true;
  return djb2(neighborhoodId) % COLD_INTERVAL_DAYS === dayNumber(localDate) % COLD_INTERVAL_DAYS;
}
