// Thursday manual-trigger: send touch 2 (flipped-funnel "subscribe free first"
// pitch) to the curated 24 top brokers. This is the controlled warmup-day-3
// batch on the new outreach.readflaneur.com subdomain.
//
// After Thursday the daily broker-drip cron takes over for the remaining
// ~305 pending brokers.
//
// Usage:
//   node scripts/send-drip-touch2-thursday.mjs          # dry-run preview
//   node scripts/send-drip-touch2-thursday.mjs --fire   # actually send

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/[\n\r]+$/, '').replace(/\/$/, '') || 'https://readflaneur.com';
const OUTREACH_FROM = 'Morgan Downey <md@outreach.readflaneur.com>';
const REPLY_TO = 'md@readflaneur.com';
const BETWEEN_SENDS_MS = 5000; // 5s gap between sends to stay gentle on subdomain warming

// The curated 24 from our prioritization: NYC tier-1 + London Mayfair/Belgravia + Stockholm.
const CURATED_EMAILS = [
  'ls@compass.com',                                // Leonard Steinberg - Tribeca
  'kblackmon@compass.com',                         // Kyle Blackmon - Tribeca
  'fkatzen@elliman.com',                           // Frances Katzen - Tribeca
  'nikki.field@sothebys.realty',                   // Nikki Field - UES
  'serena.boardman@sothebyshomes.com',             // Serena Boardman - UES
  'cathy.taub@sothebys.realty',                    // Cathy Taub - UES
  'ccc@corcoran.com',                              // Carrie Chiang - UES
  'noble@nobleblackandpartners.com',               // Noble Black - UES
  'jburger@bhsusa.com',                            // John Burger - UES
  'steve@corcoran.com',                            // Steve Gold - WV
  'lphillips@bhsusa.com',                          // Louise Phillips Forbes - WV
  'dek@corcoran.com',                              // Deanna Kory - WV
  'gary@beauchampestates.com',                     // Gary Hersham - Mayfair
  'jeremy.gee@beauchampestates.com',               // Jeremy Gee - Mayfair
  'peter@wetherell.co.uk',                         // Peter Wetherell - Mayfair
  'stuart.bailey@knightfrank.com',                 // Stuart Bailey - Mayfair
  'becky.fatemi@sothebysrealty.co.uk',             // Becky Fatemi - Mayfair
  'matthew.armstrong@knightfrank.com',             // Matthew Armstrong - Belgravia
  'richard.gutteridge@knightfrank.com',            // Richard Gutteridge - Belgravia
  'dan.martin@savills.com',                        // Dan Martin - Notting Hill
  'michael.eklund@skandiamaklarna.se',             // Michael Eklund - Östermalm
  'christian.kebert@skandiamaklarna.se',           // Christian Kebert - Östermalm
  'richard.petersson@fastighetsbyran.se',          // Richard Petersson - Östermalm
  'anna.alvagard@fastighetsbyran.se',              // Anna Alvagard - Östermalm
].map((e) => e.toLowerCase());

function buildTouch2Html({ firstName, neighborhoodDisplay, subscribeUrl, unsubUrl }) {
  return `
<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; color: #1c1917; line-height: 1.7; font-size: 16px;">
  <p>${firstName},</p>

  <p>Emailed you Monday about our broker product. On reflection I should have led differently.</p>

  <p>Simpler version: Flaneur publishes a free morning brief about ${neighborhoodDisplay}. Restaurant openings, cultural events, market moves. Subscribe as a regular reader to see what it is:</p>

  <p style="margin: 24px 0;"><a href="${subscribeUrl}" style="color: #b45309; border-bottom: 1px dotted #b45309; text-decoration: none;">${subscribeUrl.replace(/^https?:\/\//, '')}</a></p>

  <p>Read it for a couple of weeks. Judge the quality on real mornings. If you end up thinking your clients should see it, the branded-for-you version makes sense. Until then, just read it.</p>

  <p style="margin-top: 32px;">Best,<br>Morgan Downey<br>Founder, Flaneur</p>

  <p style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e7e5e4; color: #78716c; font-size: 13px;">
    Not for you? Reply "no thanks" and I will remove you. Or <a href="${unsubUrl}" style="color: #78716c;">click here to unsubscribe</a>.
  </p>
</div>
`;
}

function slugify(s) {
  return (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  const dryRun = !process.argv.includes('--fire');
  console.log(dryRun ? '=== DRY RUN (no emails sent) ===' : '=== LIVE FIRE ===');

  // Fetch broker_outreach rows for the curated emails, still in pending/active status
  const { data: rows, error } = await supabase
    .from('broker_outreach')
    .select('*')
    .in('broker_email', CURATED_EMAILS)
    .in('drip_status', ['pending']);

  if (error) { console.error('Fetch failed:', error); process.exit(1); }
  console.log(`Fetched ${rows.length} eligible rows (pending) of ${CURATED_EMAILS.length} curated emails`);

  // Report which emails weren't found in the curated list
  const foundEmails = new Set(rows.map((r) => r.broker_email));
  const missing = CURATED_EMAILS.filter((e) => !foundEmails.has(e));
  if (missing.length > 0) {
    console.log('\nMissing (not in broker_outreach as pending):');
    missing.forEach((e) => console.log('  -', e));
  }

  // Fetch neighborhoods for URL slug generation
  const nbhIds = [...new Set(rows.map((r) => r.neighborhood_id))];
  const { data: nbhs } = await supabase
    .from('neighborhoods')
    .select('id, name, city')
    .in('id', nbhIds);
  const nbhById = Object.fromEntries((nbhs || []).map((n) => [n.id, n]));

  console.log('\nWill send to:');
  for (const r of rows) {
    const nbh = nbhById[r.neighborhood_id];
    const neighborhoodDisplay = nbh ? `${nbh.name}, ${nbh.city}` : r.neighborhood_id;
    console.log('  ', r.broker_email.padEnd(42), '|', (r.broker_name || '').padEnd(22), '|', neighborhoodDisplay);
  }

  if (dryRun) {
    console.log(`\nDry run complete. Re-run with --fire to actually send.`);
    return;
  }

  console.log(`\nSending ${rows.length} touch 2 emails (${BETWEEN_SENDS_MS / 1000}s between each)...\n`);
  let sent = 0, failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const nbh = nbhById[r.neighborhood_id];
    const neighborhoodDisplay = nbh ? `${nbh.name}, ${nbh.city}` : r.neighborhood_id;
    const subscribeUrl = nbh
      ? `${APP_URL}/${slugify(nbh.city)}/${slugify(nbh.name)}`
      : APP_URL;
    const unsubUrl = `${APP_URL}/api/broker-drip/unsub?token=${r.unsub_token}`;
    const firstName = (r.broker_name || '').split(' ')[0] || 'there';

    try {
      const res = await resend.emails.send({
        from: OUTREACH_FROM,
        to: r.broker_email,
        subject: `Did Monday's email miss you?`,
        html: buildTouch2Html({ firstName, neighborhoodDisplay, subscribeUrl, unsubUrl }),
        replyTo: REPLY_TO,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      if (res.error) {
        console.log(`[${i + 1}/${rows.length}] FAIL  ${r.broker_email}  ${res.error.message}`);
        failed++;
        continue;
      }

      await supabase
        .from('broker_outreach')
        .update({
          drip_status: 'active',
          touch_2_sent_at: new Date().toISOString(),
        })
        .eq('id', r.id);

      console.log(`[${i + 1}/${rows.length}] SENT  ${r.broker_email.padEnd(42)}  (${neighborhoodDisplay})`);
      sent++;
    } catch (err) {
      console.log(`[${i + 1}/${rows.length}] ERROR ${r.broker_email}: ${err.message}`);
      failed++;
    }

    if (i < rows.length - 1) {
      await new Promise((res) => setTimeout(res, BETWEEN_SENDS_MS));
    }
  }

  console.log(`\nSummary: ${sent} sent, ${failed} failed.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
