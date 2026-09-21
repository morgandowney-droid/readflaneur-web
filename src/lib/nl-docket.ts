/**
 * Newfoundland and Labrador Provincial Court docket, read as a newsroom
 * tip sheet.
 *
 * Prototype built for the Canadian Press after the 21 September 2026 call.
 * Malcolm Kirk said a daily national crime docket "would be an amazing thing"
 * and framed it as information for his clients, "you may want to cover this
 * today", rather than content. So this never publishes anything. It reads the
 * public docket, decides which appearances are worth a reporter's morning, and
 * collapses the rest into counts.
 *
 * Why Newfoundland first: the province publishes its Provincial Court docket
 * openly at docket.court.nl.ca, for ten court centres including Gander and
 * Corner Brook, the two towns CP named. Ontario's daily court lists forbid
 * collection, copying and commercial use, so the same approach is barred there
 * and would need an access agreement.
 *
 * Two legal limits are built in rather than left to the reader:
 *   1. Youth Court dockets may not be distributed (YCJA, and F.N. (Re), 2000
 *      SCC). The public docket already omits them and nothing here re-adds them.
 *   2. The docket does not show publication bans. Every flagged item carries a
 *      check-for-a-ban line, and sexual and intimate-partner offences carry a
 *      stronger one, because naming the accused can identify the complainant.
 *
 * Nothing is stored. The docket is fetched on request and cached for half an
 * hour, so no database ever holds a list of accused people.
 */

const DOCKET_URL = 'https://docket.court.nl.ca/';

/** Office ids as the docket form lists them. */
export const NL_COURT_CENTRES: Readonly<Record<number, string>> = {
  1: "St. John's",
  2: 'Happy Valley-Goose Bay',
  3: 'Clarenville',
  4: 'Corner Brook',
  5: 'Gander',
  6: 'Grand Bank',
  7: 'Grand Falls-Windsor',
  8: 'Harbour Grace',
  9: 'Wabush',
  10: 'Stephenville',
};

/** CP's two towns lead the page. */
export const FEATURED_CENTRES = ['Gander', 'Corner Brook'];

export interface DocketCharge {
  /** "CCC", "PTA", ... */
  statute: string;
  /** "320.14(1)(a)" */
  section: string;
  description: string;
  /** The docket's own wording, e.g. "Adjourned for Trial". */
  stage: string;
}

export interface DocketAppearance {
  centre: string;
  courtroom: string;
  /** YYYY-MM-DD */
  date: string;
  time: string;
  accused: string;
  durationMinutes: number;
  charges: DocketCharge[];
}

export type Tier = 'lead' | 'watch' | 'routine';

export interface ScoredAppearance extends DocketAppearance {
  tier: Tier;
  score: number;
  stageLabel: string;
  /** One line a news editor can read at a glance. */
  why: string;
  /** Extra ban warning for offences where naming can identify a complainant. */
  sensitivity: string | null;
}

// ─── Fetch and parse ────────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Tuesday September 22, 2026" -> "2026-09-22" */
function parseDocketDate(label: string): string {
  const m = label.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return '';
  const month = MONTHS[m[1].toLowerCase()];
  return month ? `${m[3]}-${month}-${m[2].padStart(2, '0')}` : '';
}

/** "320.14-1-a--" -> "320.14(1)(a)" */
function formatSection(raw: string): string {
  const parts = raw.split('-').filter(Boolean);
  if (parts.length === 0) return raw;
  return parts[0] + parts.slice(1).map((p) => `(${p})`).join('');
}

/** "CCC 2018 [320.17----] Flight from peace officer" */
function parseCharge(text: string, stage: string): DocketCharge {
  // Statute codes include digits for provincial acts ("PCAR1", "WLAR2") and
  // the year is sometimes absent.
  const m = text.match(/^([A-Z][A-Z0-9]{1,7})(?:\s+\d{4})?\s*\[([^\]]*)\]\s*(.*)$/);
  if (!m) return { statute: '', section: '', description: text, stage };
  return { statute: m[1], section: formatSection(m[2]), description: m[3].trim(), stage };
}

function splitCentre(heading: string): { centre: string; courtroom: string } {
  const names = Object.values(NL_COURT_CENTRES).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (heading.toLowerCase().startsWith(name.toLowerCase())) {
      return { centre: name, courtroom: heading.slice(name.length).trim() };
    }
  }
  return { centre: heading, courtroom: '' };
}

/**
 * Trials are listed with the Crown in the name, in either order:
 * "COLLINS, CLIFFORD; COLLINS, CLIFFORD VS HIS MAJESTY THE KING" or
 * "HIS MAJESTY THE KING VS KEEFE, ERNEST; KEEFE, ERNEST". Keep the accused.
 */
function cleanAccused(raw: string): string {
  const parts = raw
    .split(/;|\bVS\b\.?/i)
    .map((p) => p.trim())
    .filter((p) => p && !/HIS MAJESTY|HER MAJESTY|THE KING|THE QUEEN|^R\.?$/i.test(p));
  return parts[0] || raw.trim();
}

function minutes(duration: string): number {
  const m = duration.match(/(\d+):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

export function parseDocketHtml(html: string): DocketAppearance[] {
  const out: DocketAppearance[] = [];
  const sectionRe =
    /<div style="float: left; width: 360px;">([\s\S]*?)<\/div>\s*<div style="float: left;">([\s\S]*?)<\/div>/g;
  const sections: Array<{ at: number; end: number; heading: string; date: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(html))) {
    sections.push({ at: m.index, end: sectionRe.lastIndex, heading: decode(m[1]), date: decode(m[2]) });
  }

  sections.forEach((sec, i) => {
    const body = html.slice(sec.end, i + 1 < sections.length ? sections[i + 1].at : html.length);
    const { centre, courtroom } = splitCentre(sec.heading);
    const date = parseDocketDate(sec.date);

    // Each appearance opens with a bold row carrying the time and name, then
    // one row per charge until the next bold row.
    const headRe =
      /<span[^>]*>(\d{1,2}:\d{2}\s*[AP]M)<\/span>([\s\S]*?)<\/td>[\s\S]*?Est Duration\s*([\d:]+)/g;
    const heads: Array<{ at: number; end: number; time: string; accused: string; duration: string }> = [];
    let h: RegExpExecArray | null;
    while ((h = headRe.exec(body))) {
      heads.push({ at: h.index, end: headRe.lastIndex, time: h[1], accused: cleanAccused(decode(h[2])), duration: h[3] });
    }

    heads.forEach((head, j) => {
      const block = body.slice(head.end, j + 1 < heads.length ? heads[j + 1].at : body.length);
      const charges: DocketCharge[] = [];
      const rowRe = /<tr>\s*<td[^>]*padding-left: 20px;[^>]*>[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g;
      let r: RegExpExecArray | null;
      while ((r = rowRe.exec(block))) {
        const text = decode(r[1]);
        if (text) charges.push(parseCharge(text, decode(r[2])));
      }
      out.push({
        centre,
        courtroom,
        date,
        time: head.time.replace(/\s+/, ' '),
        accused: head.accused,
        durationMinutes: minutes(head.duration),
        charges,
      });
    });
  });

  return out;
}

/**
 * One request covers every centre for the whole window. The docket is a
 * government page, so it is asked once per half hour at most.
 */
export async function fetchNlDocket(startDate: string, days: number): Promise<DocketAppearance[]> {
  const params = new URLSearchParams();
  for (const id of Object.keys(NL_COURT_CENTRES)) params.append('office[]', id);
  params.append('case_type[]', '1'); // Criminal only
  params.set('date', startDate);
  params.set('days_to_display', String(days));
  params.set('all_dates', '0');

  const res = await fetch(`${DOCKET_URL}?${params.toString()}`, {
    headers: { 'User-Agent': 'yous.news court docket prototype' },
    next: { revalidate: 1800 },
  } as RequestInit);
  if (!res.ok) throw new Error(`NL docket returned ${res.status}`);
  return parseDocketHtml(await res.text());
}

// ─── Newsroom judgement ─────────────────────────────────────────────────────

/** A death or an attempt on a life. Worth a reporter at any stage. */
const MAJOR_PATTERNS: RegExp[] = [
  /murder/i,
  /manslaughter/i,
  /causing death/i,
  /criminal negligence/i,
];

/**
 * Serious offences. A lead when something happens in court, a watch at an
 * election or plea, and routine at a status or scheduling hearing. The first
 * live run flagged 37 robbery and sexual-assault status hearings as leads,
 * which no editor would send a reporter to.
 */
const SERIOUS_PATTERNS: RegExp[] = [
  /aggravated/i,
  /robbery/i,
  /kidnap/i,
  /hostage/i,
  /trafficking in persons|human trafficking/i,
  /arson/i,
  /discharg\w*\s+(a\s+)?firearm/i,
  /sexual assault|sexual interference|sexual exploitation|invitation to sexual touching/i,
  /luring|child pornography|intimate images?/i,
  /abduction/i,
];

/** Offences worth a reporter when the stage is one where something happens. */
const WATCH_PATTERNS: RegExp[] = [
  /bodily harm/i,
  /with (a )?weapon|imitation/i,
  /strangle|choke|suffocate/i,
  /break(ing)? and enter/i,
  /forcible confinement/i,
  /fraud over|theft over/i,
  /trafficking/i,
  /dangerous operation/i,
  /flight from (a )?peace officer/i,
  /prohibited firearm|restricted firearm|loaded/i,
  /intimate partner/i,
  /extortion/i,
  /criminal harassment/i,
  /uttering threats/i,
];

const SEXUAL = /sexual|luring|child pornography|intimate images?|voyeurism/i;
const DOMESTIC = /intimate partner|family|spouse/i;

function stageOf(stages: string[]): { label: string; weight: number } {
  const all = stages.join(' | ');
  if (/for Decision|Verdict|Judgment/i.test(all)) return { label: 'Decision', weight: 3 };
  if (/Trial Continuation/i.test(all)) return { label: 'Trial continues', weight: 2.5 };
  if (/for Trial/i.test(all)) return { label: 'Trial', weight: 2.5 };
  if (/Sentenc/i.test(all)) return { label: 'Sentencing', weight: 2 };
  if (/Speedy Disposition/i.test(all)) return { label: 'Possible plea and sentence', weight: 1.5 };
  if (/ruling/i.test(all)) return { label: 'Ruling', weight: 1.5 };
  if (/Appearance Notice|Summons|Undertaking|Arrest|In Custody|Show Cause|Bail/i.test(all)) {
    return { label: 'First appearance', weight: 1.2 };
  }
  if (/Election and\/or Plea/i.test(all)) return { label: 'Election or plea', weight: 1 };
  if (/Charter/i.test(all)) return { label: 'Charter application', weight: 0.8 };
  if (/pre-?trial/i.test(all)) return { label: 'Pre-trial conference', weight: 0.4 };
  if (/Set a Date/i.test(all)) return { label: 'Setting a date', weight: 0.3 };
  if (/Status/i.test(all)) return { label: 'Status', weight: 0.2 };
  return { label: stages[0] || 'Appearance', weight: 0.5 };
}

/** Stages where something happens that a reporter could write up the same day. */
const HAPPENING = new Set(['Decision', 'Trial', 'Trial continues', 'Sentencing', 'Possible plea and sentence', 'Ruling']);


/** Charge wording is generic, so the whole description can be lowercased. */
function lower(s: string): string {
  return s.toLowerCase();
}

export function scoreAppearance(a: DocketAppearance): ScoredAppearance {
  const descriptions = a.charges.map((c) => c.description);
  const major = descriptions.find((d) => MAJOR_PATTERNS.some((p) => p.test(d)));
  const serious = descriptions.find((d) => SERIOUS_PATTERNS.some((p) => p.test(d)));
  const watch = descriptions.find((d) => WATCH_PATTERNS.some((p) => p.test(d)));
  const stage = stageOf(a.charges.map((c) => c.stage));
  const happening = HAPPENING.has(stage.label);

  let tier: Tier = 'routine';
  if (major) tier = 'lead';
  else if (serious && (happening || stage.label === 'First appearance')) tier = 'lead';
  else if (serious && stage.label === 'Election or plea') tier = 'watch';
  else if (watch && happening) tier = 'watch';
  else if ((stage.label === 'Trial' || stage.label === 'Trial continues') && a.durationMinutes >= 120) tier = 'watch';

  const lead = major || serious;
  const headline = lead || watch || descriptions[0] || 'charges not listed';
  const others = new Set(descriptions.filter((d) => d !== headline)).size;
  let why = `${stage.label} on ${lower(headline)}`;
  if (others > 0) why += ` and ${others} other charge${others === 1 ? '' : 's'}`;
  if (a.durationMinutes >= 60) why += `, ${Math.round(a.durationMinutes / 60 * 10) / 10} hours set aside`;
  else if (a.durationMinutes >= 30) why += `, ${a.durationMinutes} minutes set aside`;

  let sensitivity: string | null = null;
  if (descriptions.some((d) => SEXUAL.test(d))) {
    sensitivity =
      "The complainant's identity is almost certainly under a mandatory ban (Criminal Code s. 486.4). Naming the accused can identify them. Check before publishing anything.";
  } else if (descriptions.some((d) => DOMESTIC.test(d))) {
    sensitivity = 'Naming the accused may identify the complainant. Check for a ban before publishing.';
  }

  const score =
    (tier === 'lead' ? 3 : tier === 'watch' ? 2 : 0) +
    stage.weight +
    Math.min(a.durationMinutes / 120, 1.5) +
    Math.min(a.charges.length, 6) * 0.05;

  return { ...a, tier, score, stageLabel: stage.label, why, sensitivity };
}

export interface CentreDay {
  centre: string;
  date: string;
  flagged: ScoredAppearance[];
  routineCount: number;
  /** Routine matters collapsed to counts, most common first. */
  routineByCharge: Array<{ description: string; count: number }>;
}

export function buildTipSheet(appearances: DocketAppearance[]): CentreDay[] {
  const groups = new Map<string, DocketAppearance[]>();
  for (const a of appearances) {
    const key = `${a.date}|${a.centre}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  const days: CentreDay[] = [];
  for (const [key, list] of groups) {
    const [date, centre] = key.split('|');
    const scored = list.map(scoreAppearance);
    const flagged = scored.filter((s) => s.tier !== 'routine').sort((x, y) => y.score - x.score);
    const routine = scored.filter((s) => s.tier === 'routine');
    const counts = new Map<string, number>();
    for (const r of routine) {
      const top = r.charges[0]?.description || 'Other';
      counts.set(top, (counts.get(top) || 0) + 1);
    }
    days.push({
      centre,
      date,
      flagged,
      routineCount: routine.length,
      routineByCharge: [...counts.entries()]
        .map(([description, count]) => ({ description, count }))
        .sort((a, b) => b.count - a.count),
    });
  }

  const rank = (c: string) => {
    const i = FEATURED_CENTRES.indexOf(c);
    return i === -1 ? 99 : i;
  };
  return days.sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date)
    : rank(a.centre) !== rank(b.centre) ? rank(a.centre) - rank(b.centre)
    : b.flagged.length - a.flagged.length,
  );
}
