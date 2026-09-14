// Strip United States events that were pulled into UK and Irish editions.
//
// The event search matches on town name, so the American namesake wins as often
// as not. County Roscommon ran a Roscommon, Michigan Board of Commissioners
// meeting. County Wexford ran T-ball in Wexford, Pennsylvania. County Louth ran
// a sweetFrog in Dundalk, Maryland. Lymington, one of the three UK pilot towns,
// ran a Farmington Hills, Michigan zoning hearing two days before a publisher
// demo. This is the same fault as the Lewes, Delaware contamination in September.
//
// Removes matching lines from the [[Event Listing]] block, drops day headers
// that are left with nothing under them, and removes prose paragraphs whose
// subject is a purged event.
//
// Usage (dry run by default):
//   node scripts/purge-foreign-events.mjs                          # last 7 days
//   node scripts/purge-foreign-events.mjs --days 14 --confirm
//   node scripts/purge-foreign-events.mjs --ids hampshire-lymington --confirm

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const arg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
};
const DAYS = Number(arg('--days', 7));
const ONLY_IDS = arg('--ids', null)?.split(',').map((s) => s.trim());

// Virginia, Washington and Georgia are deliberately absent. Virginia is a town
// in County Cavan, Washington is in Tyne and Wear and is a Cork street name, and
// Georgia is a country. Their American senses get caught by the other tells.
const US_STATES =
  'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Idaho|Illinois|Iowa|Kansas|Kentucky|Louisiana|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|West Virginia|Wisconsin|Wyoming';
const US_ABBREV =
  'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IA|KS|KY|LA|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY';

// A place name followed by one of these is a street, not a state.
const STREET_WORD = '(?!\\s+(?:Street|St\\b|Road|Rd\\b|Avenue|Ave\\b|Lane|Ln\\b|Drive|Dr\\b|Square|Park|Library|Hall|House|Terrace|Place|Quay|Court))';

// Strong enough to delete published copy on their own.
const STRONG_TELLS = [
  new RegExp(`,\\s*(?:${US_STATES})\\b${STREET_WORD}`, 'i'), // ", Michigan"
  new RegExp(`,\\s*(?:${US_ABBREV})\\b\\s*\\d{5}`),          // ", NH 03581"
  new RegExp(`,\\s*(?:${US_ABBREV})\\b(?=[.,;]|\\s*$)`),     // ", MD." ending a venue
  /\bU\.?S\.?A\.?\b|\bUnited States\b/,
  /\b(?:Township|Board of Selectmen|Planning Commission|Plan Commission|Board of Commissioners|Board of Trustees|Conservation Commission|First Selectman|Commissioner's (?:Board )?Meeting|Zoning Text Amendment|Zoning Board|School District|Millage)\b/,
  // US-only road types. "Parkway" is excluded: Bristol Parkway is real.
  /\b(?:Fwy|Freeway|Turnpike)\b/,
];

// Suggestive but not sufficient. A dollar price can just be a hallucinated
// currency on a real local event, and deleting that loses genuine copy.
const WEAK_TELLS = [
  /\$\s?\d/,
  /\b(?:Fall Festival|Crab Feast|Cheer|T-Ball|Little League|Homecoming)\b/,
  new RegExp(`\\b(?:${US_ABBREV})\\b\\s*\\d{5}`),
];

const whyForeign = (line) => {
  const strong = STRONG_TELLS.find((re) => re.test(line));
  if (strong) return `STRONG ${line.match(strong)[0]}`;
  const weak = WEAK_TELLS.filter((re) => re.test(line));
  if (weak.length >= 2) return `WEAK x${weak.length} ${weak.map((re) => line.match(re)[0]).join(' + ')}`;
  return null;
};
const isForeign = (line) => whyForeign(line) !== null;

/**
 * Split a paragraph into sentences. Markdown links are parked first: a URL can
 * contain a full stop, and a split inside one would destroy the link.
 */
function splitSentences(paragraph) {
  const links = [];
  const masked = paragraph.replace(/\[[^\]]*\]\([^)]*\)/g, (m) => {
    links.push(m);
    return `LINK${links.length - 1}TOKEN`;
  });
  return masked
    .split(/(?<=[.!?])\s+(?=[A-Z"'“])/)
    .map((s) => s.replace(/LINK(\d+)TOKEN/g, (_m, i) => links[Number(i)]));
}

/** An event line carries two or more semicolons: "Name; Category, Time; Venue". */
const isEventLine = (line) => (line.match(/;/g) || []).length >= 2;
const isDayHeader = (line) => /^\[\[.+\]\]$/.test(line.trim());

function purge(body) {
  if (!body) return { body, removed: [] };
  const removed = [];

  const start = body.indexOf('[[Event Listing]]');
  const end = body.indexOf('\n---', start);
  if (start === -1 || end === -1) {
    // No structured listing; fall back to dropping whole offending paragraphs
    const kept = body.split(/\n{2,}/).filter((p) => {
      if (isForeign(p)) { removed.push(`[prose ${whyForeign(p)}] ${p.slice(0, 120)}`); return false; }
      return true;
    });
    return { body: kept.join('\n\n').replace(/\n{3,}/g, '\n\n').trim(), removed };
  }

  const listing = body.slice(start, end);
  const rest = body.slice(end);

  const blocks = listing.split(/\n{2,}/);
  const keptBlocks = [];
  for (const block of blocks) {
    if (isEventLine(block) && isForeign(block)) {
      removed.push(`[${whyForeign(block)}] ${block.slice(0, 90)}`);
      continue;
    }
    keptBlocks.push(block);
  }

  // Drop day headers with no events left underneath
  const final = [];
  for (let i = 0; i < keptBlocks.length; i++) {
    const block = keptBlocks[i];
    if (isDayHeader(block) && block !== '[[Event Listing]]') {
      const next = keptBlocks[i + 1];
      if (!next || isDayHeader(next)) continue; // nothing under this day
    }
    final.push(block);
  }

  // Prose after the --- may still describe a purged event. Paragraphs are mixed
  // (a real Dundalk, Louth whiskey tasting sitting beside a Dundalk, Maryland
  // crab feast), so cut sentences, not paragraphs.
  const proseParts = rest.split(/\n{2,}/).map((p) => {
    if (isDayHeader(p)) return p;
    const kept = splitSentences(p).filter((sentence) => {
      if (!isForeign(sentence)) return true;
      removed.push(`[prose ${whyForeign(sentence)}] ${sentence.trim().slice(0, 110)}`);
      return false;
    });
    return kept.join(' ').replace(/\s{2,}/g, ' ').trim();
  }).filter(Boolean);

  const rebuilt = (final.join('\n\n') + '\n\n' + proseParts.join('\n\n').replace(/^\n+/, ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { body: rebuilt, removed };
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: hoods } = await sb
  .from('neighborhoods')
  .select('id, name, country')
  .in('country', ['Ireland', 'United Kingdom', 'UK', 'Great Britain', 'England', 'Scotland', 'Wales']);
const ids = (ONLY_IDS || hoods.map((h) => h.id)).filter((id) => hoods.some((h) => h.id === id));
const byId = Object.fromEntries(hoods.map((h) => [h.id, h]));

const since = new Date(Date.now() - DAYS * 86400000).toISOString();
const rows = [];
for (let from = 0; ; from += 500) {
  const { data, error } = await sb
    .from('articles')
    .select('id, neighborhood_id, headline, body_text, published_at')
    .gte('published_at', since)
    .in('neighborhood_id', ids)
    .order('id')
    .range(from, from + 499);
  if (error) { console.error(error); process.exit(1); }
  rows.push(...(data || []));
  if (!data || data.length < 500) break;
}

console.log(`${CONFIRM ? 'LIVE' : 'DRY RUN'}: ${rows.length} UK/IE articles in the last ${DAYS} days\n`);

let changed = 0;
let linesRemoved = 0;
const touched = [];
for (const a of rows) {
  const { body, removed } = purge(a.body_text);
  if (!removed.length) continue;
  changed++;
  linesRemoved += removed.length;
  touched.push(a.id);
  console.log(`[${byId[a.neighborhood_id]?.name}] ${a.published_at.slice(0, 10)}  ${a.headline}`);
  for (const r of removed) console.log(`    - ${r.replace(/\s+/g, ' ')}`);
  if (CONFIRM) {
    const { error } = await sb.from('articles').update({ body_text: body }).eq('id', a.id);
    if (error) console.error('   update failed:', error.message);
  }
}

if (CONFIRM && touched.length) {
  for (let i = 0; i < touched.length; i += 100) {
    await sb.from('article_translations').delete().in('article_id', touched.slice(i, i + 100));
  }
}

console.log(`\narticles ${CONFIRM ? 'cleaned' : 'to clean'}: ${changed} | entries removed: ${linesRemoved}`);
if (!CONFIRM) console.log('Re-run with --confirm to write.');
