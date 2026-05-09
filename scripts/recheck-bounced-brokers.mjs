// One-shot: re-verify the 75 brokers in broker_outreach with drip_status='bounced'
// against Hunter.io. Some of them may have soft-bounced on the original Apr blast
// (temp blocks, vacation responders, full mailbox) and would now go through.
//
// Hunter free tier: 50 verifications/month. Paid: 500/mo. 75 brokers = 1.5x free
// quota, so unless you have paid, this will partially complete and you can run
// again next month for the rest.
//
// What we do with results:
//   status='valid'       -> flip drip_status back to 'pending' (re-enter funnel)
//   status='accept_all'  -> leave as bounced (still risky, no SMTP confirmation)
//   status='invalid'     -> leave as bounced (confirmed dead)
//   status='unknown'     -> leave as bounced (couldn't probe, default to skip)
//
// Usage:
//   node scripts/recheck-bounced-brokers.mjs            # dry-run
//   node scripts/recheck-bounced-brokers.mjs --fire     # actually update DB

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
config({ path: '.env.local' });

const HUNTER_KEY = process.env.HUNTER_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!HUNTER_KEY) { console.error('HUNTER_API_KEY missing'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Supabase keys missing'); process.exit(1); }

const fire = process.argv.includes('--fire');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const { data: bounced } = await supabase
  .from('broker_outreach')
  .select('id, broker_email, broker_name, neighborhood_id')
  .eq('drip_status', 'bounced')
  .order('broker_email');

if (!bounced || bounced.length === 0) {
  console.log('No bounced rows found.');
  process.exit(0);
}

console.log(`Found ${bounced.length} bounced brokers to re-verify ${fire ? '(LIVE)' : '(DRY RUN)'}`);
console.log('');

const recovered = [];
const stillBad = [];
const risky = [];
const counts = {};

for (let i = 0; i < bounced.length; i++) {
  const row = bounced[i];
  try {
    const r = await fetch(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(row.broker_email)}&api_key=${HUNTER_KEY}`);
    const data = await r.json().catch(() => ({}));
    if (r.status === 222 || data?.errors?.[0]?.id === 'verification_failed') {
      counts.unknown = (counts.unknown || 0) + 1;
      console.log(`[${i+1}/${bounced.length}] unknown    score=?    ${row.broker_email}`);
      risky.push(row);
    } else if (!r.ok) {
      console.log(`[${i+1}/${bounced.length}] ERROR ${r.status}: ${row.broker_email} - ${data?.errors?.[0]?.details || ''}`);
      // If we hit the monthly quota, stop early
      if ((data?.errors?.[0]?.details || '').toLowerCase().includes('quota') || r.status === 402 || r.status === 429) {
        console.log('\nHunter quota hit. Stopping early. Re-run next month.');
        break;
      }
      risky.push(row);
    } else {
      const status = data?.data?.status || 'unknown';
      const score = data?.data?.score ?? '?';
      counts[status] = (counts[status] || 0) + 1;
      console.log(`[${i+1}/${bounced.length}] ${status.padEnd(10)} score=${String(score).padStart(3)}  ${row.broker_email}`);
      if (status === 'valid') recovered.push(row);
      else if (status === 'invalid' || status === 'disposable') stillBad.push(row);
      else risky.push(row);  // accept_all, unknown, webmail
    }
  } catch (err) {
    console.log(`[${i+1}/${bounced.length}] FETCH FAILED ${row.broker_email}: ${err.message}`);
    risky.push(row);
  }
  await new Promise((r) => setTimeout(r, 350));  // ~3 req/s, well under Hunter limits
}

console.log('\n─── Summary ───');
Object.entries(counts).forEach(([k, v]) => console.log(`  ${k.padEnd(12)} ${v}`));
console.log('');
console.log(`Recovered (back to pending): ${recovered.length}`);
console.log(`Still bad (left as bounced): ${stillBad.length}`);
console.log(`Risky (left as bounced):     ${risky.length}`);

if (recovered.length > 0 && fire) {
  console.log(`\nFlipping ${recovered.length} brokers back to drip_status='pending'...`);
  const ids = recovered.map((r) => r.id);
  const { error } = await supabase
    .from('broker_outreach')
    .update({ drip_status: 'pending' })
    .in('id', ids);
  if (error) { console.error('Update failed:', error); process.exit(1); }
  console.log('Done. They will be picked up by the next campaign-2 touch-1 run.');
} else if (recovered.length > 0) {
  console.log('\nDry run only. Add --fire to flip these back to pending.');
}
