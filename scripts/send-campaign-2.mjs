// Campaign 2: re-engage the existing broker_outreach list with a 3-day
// sample-then-pitch sequence framed around the $999 -> $299 price drop and
// "your neighborhood is still available" scarcity.
//
// Cadence (each touch is a separate manual run, ideally one per day):
//   --touch=1   Day 1 sample. Live branded daily brief from
//               "Flaneur Sample: <Neighborhood> Daily" with a top banner
//               making clear it's a demo. Body shows the broker's real
//               name + brokerage in the "Curated by" line.
//   --touch=2   Day 2 sample. Same as above but a fresh day's content.
//   --touch=3   Day 3 marketing pitch. Plain editorial-style email
//               referencing "the past two mornings" + price drop +
//               scarcity + setup link.
//
// Filtering (applied to every touch):
//   - drip_status NOT IN ('unsubscribed', 'bounced', 'neighborhood_taken',
//                          'not_interested', 'ooo')
//   - neighborhood has no active agent_partners row
//   - the c2_<touch>_sent_at column for this touch is NULL (idempotent)
//   - touches 2 and 3 also require the previous c2 touch to have fired
//     (so we don't pitch someone who never got the samples)
//
// Defaults to a dry-run preview that prints the first 3 recipients + the
// rendered email size. Add --fire to actually send. Updates broker_outreach
// on success.
//
// Usage:
//   node scripts/send-campaign-2.mjs --touch=1
//   node scripts/send-campaign-2.mjs --touch=1 --limit=20
//   node scripts/send-campaign-2.mjs --touch=2 --fire
//   node scripts/send-campaign-2.mjs --touch=3 --limit=10 --fire
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//      CRON_SECRET (used to call /api/partner/pitch-preview), NEXT_PUBLIC_APP_URL

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

config({ path: '.env.local' });

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com').replace(/\/$/, '');
const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PITCH_FROM = 'Morgan Downey <md@outreach.readflaneur.com>';
const PITCH_REPLY_TO = 'md@readflaneur.com';

// ─── Args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arg = (key, def = undefined) => {
  const m = args.find((a) => a.startsWith(`--${key}=`));
  return m ? m.split('=').slice(1).join('=') : def;
};
const has = (key) => args.includes(`--${key}`);

const touch = parseInt(arg('touch', '0'));
const limit = parseInt(arg('limit', '40'));
const delayMs = parseInt(arg('delay-ms', '6000'));
const fire = has('fire');

if (![1, 2, 3].includes(touch)) {
  console.error('Usage: node scripts/send-campaign-2.mjs --touch={1|2|3} [--limit=40] [--delay-ms=6000] [--fire]');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY || !RESEND_API_KEY) {
  console.error('Missing required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY');
  process.exit(1);
}
if (touch <= 2 && !CRON_SECRET) {
  console.error('Missing CRON_SECRET (needed to call /api/partner/pitch-preview for sample sends)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const resend = new Resend(RESEND_API_KEY);

// ─── Fetch eligible recipients ─────────────────────────────────────────
const TOUCH_COL = touch === 1 ? 'c2_sample_1_sent_at'
                 : touch === 2 ? 'c2_sample_2_sent_at'
                              : 'c2_pitch_sent_at';
const PREREQ_COL = touch === 2 ? 'c2_sample_1_sent_at'
                  : touch === 3 ? 'c2_sample_2_sent_at'
                              : null;

console.log(`\nCampaign 2 — touch ${touch} ${fire ? '(LIVE)' : '(DRY RUN)'}`);
console.log(`Filter: ${TOUCH_COL} IS NULL${PREREQ_COL ? ` AND ${PREREQ_COL} IS NOT NULL` : ''}`);

// 1. Find neighborhood IDs that already have an active partner (skip these)
const { data: takenRows } = await supabase
  .from('agent_partners')
  .select('neighborhood_id')
  .eq('status', 'active');
const takenIds = new Set((takenRows || []).map((r) => r.neighborhood_id));
console.log(`Excluded ${takenIds.size} neighborhoods with active partners`);

// 2. Fetch eligible broker_outreach rows
let query = supabase
  .from('broker_outreach')
  .select('id, broker_email, broker_name, brokerage_name, neighborhood_id, drip_status, c2_sample_1_sent_at, c2_sample_2_sent_at, c2_pitch_sent_at, unsub_token')
  .not('drip_status', 'in', '(unsubscribed,bounced,neighborhood_taken,not_interested,ooo)')
  .is(TOUCH_COL, null)
  .order('created_at', { ascending: true });

if (PREREQ_COL) {
  query = query.not(PREREQ_COL, 'is', null);
}

const { data: rows, error: fetchErr } = await query;
if (fetchErr) {
  console.error('Failed to fetch broker_outreach:', fetchErr);
  process.exit(1);
}

const eligible = (rows || []).filter((r) => !takenIds.has(r.neighborhood_id));
console.log(`${eligible.length} eligible broker rows total. Capping to ${limit} for this run.`);

const queue = eligible.slice(0, limit);
if (queue.length === 0) {
  console.log('Nothing to send. Done.');
  process.exit(0);
}

// 3. Look up neighborhood display names for the queue
const neighborhoodIds = [...new Set(queue.map((r) => r.neighborhood_id))];
const { data: neighborhoods } = await supabase
  .from('neighborhoods')
  .select('id, name, city')
  .in('id', neighborhoodIds);
const nbhMap = new Map((neighborhoods || []).map((n) => [n.id, n]));

// ─── Email senders ─────────────────────────────────────────────────────

async function sendSample(row) {
  // Calls the existing pitch-preview API in sample-campaign mode. The API
  // assembles today's actual brief content for the neighborhood and renders
  // it via BrandedDailyBriefTemplate with the SAMPLE EDITION banner and a
  // "Flaneur Sample: <Neighborhood> Daily" from-line.
  const nbh = nbhMap.get(row.neighborhood_id);
  const subscribeUrl = `${APP_URL}/partner/setup?email=${encodeURIComponent(row.broker_email)}&neighborhood=${encodeURIComponent(row.neighborhood_id)}`
    + (row.broker_name ? `&name=${encodeURIComponent(row.broker_name)}` : '')
    + (row.brokerage_name ? `&brokerage=${encodeURIComponent(row.brokerage_name)}` : '');

  const res = await fetch(`${APP_URL}/api/partner/pitch-preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify({
      agentName: row.broker_name || 'Your Name',
      agentEmail: row.broker_email,
      neighborhoodId: row.neighborhood_id,
      brokerageName: row.brokerage_name || undefined,
      subscribeUrl,
      isSampleCampaign: true,
      senderDisplayName: 'Flaneur Sample',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return { neighborhood: nbh ? `${nbh.name}, ${nbh.city}` : row.neighborhood_id };
}

function buildPitchHtml(row, nbh) {
  const firstName = (row.broker_name || '').split(' ')[0] || 'there';
  const neighborhoodLabel = nbh ? `${nbh.name}, ${nbh.city}` : row.neighborhood_id;
  const setupUrl = `${APP_URL}/partner/setup?email=${encodeURIComponent(row.broker_email)}&neighborhood=${encodeURIComponent(row.neighborhood_id)}`
    + (row.broker_name ? `&name=${encodeURIComponent(row.broker_name)}` : '')
    + (row.brokerage_name ? `&brokerage=${encodeURIComponent(row.brokerage_name)}` : '');
  const unsubUrl = `${APP_URL}/api/broker-drip/unsub?token=${row.unsub_token}`;

  return `
<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; color: #1c1917; line-height: 1.7; font-size: 16px;">
  <p>${firstName},</p>

  <p>I sent you the past two mornings of the ${neighborhoodLabel} Daily so you could judge the editorial on real days, not a marketing mockup.</p>

  <p>Two things you have not seen yet:</p>

  <p style="margin: 20px 0 20px 16px;">
    <strong>1. Pricing came down.</strong> The branded version is now <strong>US$299/month</strong>, dropped from $999. Same product. We listened to brokers who said the original price was a non-starter and made it reachable.<br><br>
    <strong>2. ${neighborhoodLabel} is still available.</strong> One agent per neighborhood, first to activate keeps it. Most luxury markets have not been claimed yet, but a few have moved this past week.
  </p>

  <p>If the past two mornings looked like something your clients would actually open, the branded version takes about 5 minutes to set up. Your name, photo, and listings would replace the placeholders, sent to your client list at 7 AM local time, every day.</p>

  <p style="margin: 32px 0;">
    <a href="${setupUrl}" style="display: inline-block; padding: 14px 28px; background: #1c1917; color: #fafaf9; text-decoration: none; border-radius: 4px; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase;">Claim ${nbh ? nbh.name : 'My Neighborhood'} - Free Trial</a>
  </p>

  <p style="color: #57534e; font-size: 14px;"><strong>14-day free trial. No charge today.</strong> Card on file, charged on day 14, cancel anytime before then at no cost.</p>

  <p style="margin-top: 32px;">Best,<br>Morgan Downey<br>Founder, Flaneur</p>

  <p style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e7e5e4; color: #78716c; font-size: 13px;">
    Not for you? Reply "no thanks" and I will remove you. Or <a href="${unsubUrl}" style="color: #78716c;">click here to unsubscribe</a>.
  </p>
</div>
`;
}

async function sendPitch(row) {
  const nbh = nbhMap.get(row.neighborhood_id);
  const neighborhoodLabel = nbh ? `${nbh.name}, ${nbh.city}` : row.neighborhood_id;
  const html = buildPitchHtml(row, nbh);
  const unsubUrl = `${APP_URL}/api/broker-drip/unsub?token=${row.unsub_token}`;

  const result = await resend.emails.send({
    from: PITCH_FROM,
    to: row.broker_email,
    subject: `${neighborhoodLabel} - new pricing + your slot is still open`,
    html,
    replyTo: PITCH_REPLY_TO,
    headers: {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
  if (result.error) throw new Error(result.error.message || 'Resend send failed');
  return { neighborhood: neighborhoodLabel };
}

// ─── Dry-run preview ───────────────────────────────────────────────────
if (!fire) {
  console.log(`\nDry-run preview (first 3 of ${queue.length}):\n`);
  for (const row of queue.slice(0, 3)) {
    const nbh = nbhMap.get(row.neighborhood_id);
    const label = nbh ? `${nbh.name}, ${nbh.city}` : row.neighborhood_id;
    if (touch <= 2) {
      console.log(`  - ${row.broker_email} (${row.broker_name || '?'}) -> SAMPLE for ${label}`);
    } else {
      const html = buildPitchHtml(row, nbh);
      console.log(`  - ${row.broker_email} (${row.broker_name || '?'}) -> PITCH for ${label}`);
      console.log(`      subject: "${label} - new pricing + your slot is still open"`);
      console.log(`      body length: ${html.length} chars`);
    }
  }
  console.log('\nNot sending. Add --fire to actually send.');
  process.exit(0);
}

// ─── Live send ─────────────────────────────────────────────────────────
console.log(`\nSending ${queue.length} emails with ${delayMs}ms delay between sends...\n`);

let sent = 0;
let failed = 0;
const errors = [];

for (const row of queue) {
  const nbh = nbhMap.get(row.neighborhood_id);
  const label = nbh ? `${nbh.name}, ${nbh.city}` : row.neighborhood_id;
  try {
    if (touch <= 2) {
      await sendSample(row);
    } else {
      await sendPitch(row);
    }
    const { error: updateErr } = await supabase
      .from('broker_outreach')
      .update({ [TOUCH_COL]: new Date().toISOString() })
      .eq('id', row.id);
    if (updateErr) {
      console.warn(`  warn: sent but failed to mark ${row.broker_email} as sent:`, updateErr.message);
    }
    sent++;
    console.log(`  [${sent}/${queue.length}] sent to ${row.broker_email} (${label})`);
  } catch (err) {
    failed++;
    errors.push(`${row.broker_email} / ${label}: ${err.message}`);
    console.error(`  FAILED ${row.broker_email}: ${err.message}`);
  }
  if (queue.indexOf(row) < queue.length - 1) {
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

console.log(`\nDone. Sent ${sent}, failed ${failed}.`);
if (errors.length) {
  console.log('\nErrors:');
  errors.forEach((e) => console.log('  ' + e));
}
