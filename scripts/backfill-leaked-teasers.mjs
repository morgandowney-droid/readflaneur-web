// Remove teasers that leaked into brief prose before src/lib/brief-enricher-gemini.ts
// learned to strip them (2026-09-11).
//
// Gemini writes the subject and email teasers into the JSON block as asked, and
// sometimes ALSO drops them into the newsletter as bare paragraphs after the
// greeting. Unlabelled, so the SUBJECT_TEASER:/EMAIL_TEASER: line strippers miss
// them. About 11% of briefs were affected.
//
// Cleans both copies: neighborhood_briefs.enriched_content and the body_text of
// the brief_summary article generated from it.
//
// Usage (dry run by default):
//   node scripts/backfill-leaked-teasers.mjs                 # last 3 days
//   node scripts/backfill-leaked-teasers.mjs --days 14 --confirm

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const daysIdx = args.indexOf('--days');
const DAYS = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 3;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Mirrors stripLeakedTeasers() in src/lib/brief-enricher-gemini.ts
const normalise = (s) =>
  s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function strip(text, subjectTeaser, emailTeaser) {
  if (!text || (!subjectTeaser && !emailTeaser)) return text;
  const targets = [subjectTeaser, emailTeaser].filter(Boolean).map(normalise).filter((t) => t.length > 3);
  if (targets.length === 0) return text;
  const firstHeader = text.indexOf('[[');
  const head = firstHeader > 0 ? text.slice(0, firstHeader) : text;
  const tail = firstHeader > 0 ? text.slice(firstHeader) : '';
  const kept = head.split(/\n{2,}/).filter((block) => !targets.includes(normalise(block)));
  const rebuilt = (kept.join('\n\n') + (tail ? '\n\n' + tail : '')).replace(/\n{3,}/g, '\n\n').trim();
  return rebuilt || text;
}

const since = new Date(Date.now() - DAYS * 86400000).toISOString();
const { data: briefs, error } = await sb
  .from('neighborhood_briefs')
  .select('id, neighborhood_id, subject_teaser, email_teaser, enriched_content')
  .gte('created_at', since)
  .not('enriched_content', 'is', null)
  .limit(1000);
if (error) { console.error(error); process.exit(1); }

console.log(`${CONFIRM ? 'LIVE' : 'DRY RUN'}: ${briefs.length} enriched briefs in the last ${DAYS} days`);

let briefsFixed = 0, articlesFixed = 0;
for (const b of briefs) {
  const cleaned = strip(b.enriched_content, b.subject_teaser, b.email_teaser);
  if (cleaned === b.enriched_content) continue;
  briefsFixed++;
  const removed = b.enriched_content.length - cleaned.length;
  console.log(`  ${b.neighborhood_id} (-${removed} chars)`);

  if (CONFIRM) {
    const { error: e1 } = await sb.from('neighborhood_briefs').update({ enriched_content: cleaned }).eq('id', b.id);
    if (e1) console.error('   brief update failed:', e1.message);
  }

  // The article carries its own copy of the prose
  const { data: arts } = await sb
    .from('articles')
    .select('id, body_text')
    .eq('brief_id', b.id)
    .eq('article_type', 'brief_summary');
  for (const a of arts || []) {
    const body = strip(a.body_text || '', b.subject_teaser, b.email_teaser);
    if (body === a.body_text) continue;
    articlesFixed++;
    if (CONFIRM) {
      const { error: e2 } = await sb.from('articles').update({ body_text: body }).eq('id', a.id);
      if (e2) console.error('   article update failed:', e2.message);
    }
    // A stale translation would keep the leak; drop it so the next view re-translates
    if (CONFIRM) await sb.from('article_translations').delete().eq('article_id', a.id);
  }
  if (CONFIRM) await sb.from('brief_translations').delete().eq('brief_id', b.id);
}

console.log(`briefs ${CONFIRM ? 'fixed' : 'to fix'}: ${briefsFixed} | articles: ${articlesFixed}`);
if (!CONFIRM) console.log('Re-run with --confirm to write.');
