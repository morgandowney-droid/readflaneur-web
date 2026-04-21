// One-off: populate broker_outreach from the CSVs we used to send touch 1.
//
// Reads outreach/targets.csv + targets-batch5.csv + targets-batch6.csv and
// upserts into broker_outreach, mapping CSV status to drip_status:
//   sent            -> pending   (eligible for touch 2)
//   bounced         -> bounced   (never send again)
//   skip            -> (skipped entirely, Becky Fatemi dup)
//   paternal_leave  -> ooo
//   not_interested  -> not_interested
//
// Safe to re-run: uses upsert on (broker_email, neighborhood_id).

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
  const parseLine = (line) => {
    const out = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
        if (c === '"') { inQ = false; continue; }
        cur += c;
      } else {
        if (c === '"') { inQ = true; continue; }
        if (c === ',') { out.push(cur); cur = ''; continue; }
        cur += c;
      }
    }
    out.push(cur); return out;
  };
  const h = parseLine(lines[0]);
  return lines.slice(1).map((l) => { const c = parseLine(l); const o = {}; h.forEach((k, i) => o[k] = (c[i] || '').trim()); return o; });
}

const STATUS_MAP = {
  sent: 'pending',
  bounced: 'bounced',
  paternal_leave: 'ooo',
  not_interested: 'not_interested',
};

async function main() {
  const all = [];
  for (const f of ['outreach/targets.csv', 'outreach/targets-batch5.csv', 'outreach/targets-batch6.csv']) {
    all.push(...parseCsv(fs.readFileSync(f, 'utf8')));
  }
  console.log('Loaded', all.length, 'rows from CSVs');

  // Get valid neighborhood ids for FK check
  const { data: nbhs } = await supabase.from('neighborhoods').select('id');
  const validNbh = new Set(nbhs.map((n) => n.id));

  // De-dup: same (email, neighborhood) across CSVs. Later CSV wins (newer status).
  const byKey = new Map();
  for (const r of all) {
    const email = (r.agent_email || '').toLowerCase().trim();
    if (!email || !email.includes('@')) continue;
    if (r.status === 'skip') continue;
    if (!validNbh.has(r.neighborhood_id)) continue;
    const key = email + '|' + r.neighborhood_id;
    byKey.set(key, r);
  }
  console.log('Unique (email, neighborhood) pairs:', byKey.size);

  // Upsert in batches of 100
  const rows = [...byKey.values()].map((r) => ({
    broker_email: r.agent_email.toLowerCase().trim(),
    broker_name: r.agent_name || null,
    brokerage_name: r.brokerage_name || null,
    neighborhood_id: r.neighborhood_id,
    source: 'cold_pitch_2026_04_20',
    touch_1_sent_at: r.sent_at || null,
    drip_status: STATUS_MAP[r.status] || 'pending',
    reply_received_at: (r.status === 'not_interested' || r.status === 'paternal_leave') ? r.sent_at : null,
    reply_type: r.status === 'not_interested'
      ? (r.notes && r.notes.toLowerCase().includes('pricing') ? 'price_objection' : 'not_interested')
      : r.status === 'paternal_leave' ? 'ooo' : null,
  }));

  let totalUpserted = 0;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error, count } = await supabase
      .from('broker_outreach')
      .upsert(batch, { onConflict: 'broker_email,neighborhood_id', count: 'exact' });
    if (error) {
      console.error('Batch', i, 'failed:', error.message);
      console.error('Sample row:', JSON.stringify(batch[0], null, 2));
      process.exit(1);
    }
    totalUpserted += batch.length;
    console.log('  upserted batch', i, '+', batch.length, '= total', totalUpserted);
  }

  // Summary by drip_status
  const { data: summary } = await supabase
    .from('broker_outreach')
    .select('drip_status');
  const counts = {};
  for (const s of (summary || [])) counts[s.drip_status] = (counts[s.drip_status] || 0) + 1;
  console.log('\nbroker_outreach status counts after backfill:');
  for (const [k, v] of Object.entries(counts).sort()) console.log(' ', k.padEnd(22), v);
}

main().catch((err) => { console.error(err); process.exit(1); });
