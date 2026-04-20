// Send the two-email broker cold pitch (founder email + live branded Daily Brief
// preview) to every queued row in a CSV of targets.
//
// CSV schema (header row required):
//   neighborhood_id,neighborhood_display,agent_name,agent_email,agent_title,
//   agent_phone,brokerage_name,brokerage_url,photo_url,sample_listing_url,
//   sample_listing_address,sample_listing_price,priority,status,sent_at,notes
//
// Rows where `status` is empty or `queued` are sent. Rows where status is
// anything else (sent, failed, skip) are left alone. Results are written to a
// timestamped sent-log CSV next to the input — the input is never mutated.
//
// Usage:
//   node scripts/send-broker-pitches.mjs outreach/targets.csv
//   node scripts/send-broker-pitches.mjs outreach/targets.csv --limit=5
//   node scripts/send-broker-pitches.mjs outreach/targets.csv --dry-run
//   node scripts/send-broker-pitches.mjs outreach/targets.csv --delay-ms=6000

import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { Resend } from 'resend';

config({ path: '.env.local' });

const APP_URL = 'https://readflaneur.com';

// ─── Minimal CSV parse/stringify (comma separator, double-quoted fields) ────

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = (cells[i] ?? '').trim();
    return obj;
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQuotes = false; continue; }
      cur += ch;
    } else {
      if (ch === '"') { inQuotes = true; continue; }
      if (ch === ',') { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function stringifyCsv(rows) {
  if (rows.length === 0) return '';
  const header = Object.keys(rows[0]);
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(header.map((k) => escapeCell(row[k])).join(','));
  }
  return lines.join('\n') + '\n';
}

function escapeCell(v) {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ─── CLI args ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith('--')) || 'outreach/targets.csv';
  const getFlag = (name, def) => {
    const raw = args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
    return raw != null ? raw : def;
  };
  return {
    csvPath,
    limit: Number(getFlag('limit', Infinity)),
    delayMs: Number(getFlag('delay-ms', 4000)),
    dryRun: args.includes('--dry-run'),
  };
}

// ─── Email body ────────────────────────────────────────────────────────────

function buildSetupUrl(r) {
  const params = new URLSearchParams({
    neighborhood: r.neighborhood_id,
    name: r.agent_name,
    email: r.agent_email,
  });
  if (r.brokerage_name) params.set('brokerage', r.brokerage_name);
  if (r.agent_title) params.set('title', r.agent_title);
  if (r.agent_phone) params.set('phone', r.agent_phone);
  return `${APP_URL}/partner/setup?${params.toString()}`;
}

function buildColdPitchHtml(r, setupUrl) {
  const firstName = (r.agent_name || '').split(' ')[0] || 'there';
  const neighborhood = r.neighborhood_display || r.neighborhood_id;
  const firm = r.brokerage_name || 'your brokerage';
  const resampleSubject = `Send me another ${neighborhood} sample`;
  const resampleBody = `Hi Morgan,\n\nPlease send me another live ${neighborhood} Daily sample.\n\nThanks,\n${r.agent_name}`;

  return `
<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; color: #1c1917; line-height: 1.7; font-size: 16px;">
  <p>Hi ${firstName},</p>

  <p>${firm} is one of the top brokerages covering ${neighborhood}, so I'm reaching out directly before the slot is taken.</p>

  <p>I built Flaneur - a morning brief about ${neighborhood}. Restaurant openings, cultural events, market moves, the kind of neighborhood intelligence your clients already track, pulled into a single three-minute read they open with their coffee.</p>

  <p>Here's what the broker version looks like:</p>

  <ul style="padding-left: 20px; color: #44403c;">
    <li style="margin-bottom: 10px;"><strong>Your name and photo at the top.</strong> Your listings inline. Not a banner ad - it reads like a newsletter you curate.</li>
    <li style="margin-bottom: 10px;"><strong>Exclusive to one agent per neighborhood.</strong> Whoever signs first for ${neighborhood} keeps it for as long as they subscribe.</li>
    <li style="margin-bottom: 10px;"><strong>Every morning at 7 AM local time, 365 days a year.</strong> No missed days, no vacation gaps.</li>
    <li style="margin-bottom: 10px;"><strong>You receive a copy of every send</strong> so you see exactly what your clients see. And you get a weekly performance report every Monday.</li>
  </ul>

  <p style="margin: 32px 0; padding: 20px 24px; background: #fafaf9; border-left: 3px solid #b45309;">
    <strong>The next email from me is a live sample</strong> - today's actual ${neighborhood} Daily, with your name on it. So you can judge the product by what your clients would actually receive tomorrow, not a marketing mockup.
  </p>

  <p><strong>14-day free trial. No charge today.</strong> US$999/month after that, billed in USD. Cancel anytime.</p>

  <p>Setup takes about 5 minutes and I've pre-filled the form with your details:</p>

  <p style="margin: 24px 0;">
    <a href="${setupUrl}" style="display: inline-block; padding: 14px 28px; background: #1c1917; color: #fafaf9; text-decoration: none; border-radius: 4px; font-size: 14px; letter-spacing: 0.1em; text-transform: uppercase;">Start My 14-Day Free Trial</a>
  </p>

  <p>Want to see another live sample from a different day? <a href="mailto:md@readflaneur.com?subject=${encodeURIComponent(resampleSubject)}&body=${encodeURIComponent(resampleBody)}" style="color: #b45309;">Reply and I'll send another one tomorrow morning.</a></p>

  <p style="margin-top: 40px;">Best,<br>Morgan Downey<br>Founder, Flaneur<br><a href="mailto:md@readflaneur.com" style="color: #b45309;">md@readflaneur.com</a></p>

  <p style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #e7e5e4; color: #78716c; font-size: 13px;">
    Not interested? No follow-up - just reply "no thanks" and I'll remove you.
  </p>
</div>
`;
}

// ─── Send one broker's two-email sequence ──────────────────────────────────

async function sendOne(r, resend) {
  const setupUrl = buildSetupUrl(r);
  const neighborhood = r.neighborhood_display || r.neighborhood_id;

  // Email 1: founder cold pitch
  const coldRes = await resend.emails.send({
    from: 'Morgan Downey <md@readflaneur.com>',
    to: r.agent_email,
    subject: `Securing the ${neighborhood} morning brief for your brokerage`,
    html: buildColdPitchHtml(r, setupUrl),
    replyTo: 'md@readflaneur.com',
  });
  if (coldRes.error) {
    throw new Error(`cold pitch: ${coldRes.error.message || JSON.stringify(coldRes.error)}`);
  }

  // Brief gap so the cold pitch lands first, then the live sample on top of it
  await new Promise((res) => setTimeout(res, 3000));

  // Email 2: live branded Daily Brief preview via our endpoint (also adds
  // the recipient to partner_waitlist with source='cold_pitch' automatically)
  const previewRes = await fetch(`${APP_URL}/api/partner/pitch-preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({
      agentName: r.agent_name,
      agentEmail: r.agent_email,
      neighborhoodId: r.neighborhood_id,
      brokerageName: r.brokerage_name || undefined,
      agentTitle: r.agent_title || undefined,
      agentPhone: r.agent_phone || undefined,
      subscribeUrl: setupUrl,
    }),
  });
  const previewData = await previewRes.json().catch(() => ({}));
  if (!previewRes.ok) {
    throw new Error(`preview: ${previewData.error || previewRes.status}`);
  }

  return { coldId: coldRes.data?.id, previewOk: !!previewData.success };
}

// ─── Main ──────────────────────────────────────────────────────────────────

function validateRow(r) {
  const errs = [];
  if (!r.neighborhood_id) errs.push('missing neighborhood_id');
  if (!r.agent_name) errs.push('missing agent_name');
  if (!r.agent_email || !r.agent_email.includes('@')) errs.push('missing/invalid agent_email');
  return errs;
}

async function main() {
  const { csvPath, limit, delayMs, dryRun } = parseArgs();

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }
  if (!dryRun) {
    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY missing in .env.local');
      process.exit(1);
    }
    if (!process.env.CRON_SECRET) {
      console.error('CRON_SECRET missing in .env.local');
      process.exit(1);
    }
  }

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const queued = rows.filter((r) => !r.status || r.status === 'queued');
  const batch = queued.slice(0, Number.isFinite(limit) ? limit : queued.length);

  console.log(`CSV: ${csvPath}`);
  console.log(`Total rows: ${rows.length}  |  Queued: ${queued.length}  |  This batch: ${batch.length}`);
  if (dryRun) console.log('DRY RUN - no emails will be sent.');

  // Pre-flight: invalid rows
  const invalid = batch.map((r, i) => ({ i, r, errs: validateRow(r) })).filter((x) => x.errs.length);
  if (invalid.length) {
    console.log(`\n${invalid.length} row(s) invalid:`);
    for (const { i, r, errs } of invalid) {
      console.log(`  row ${i + 1} (${r.agent_email || 'no email'}): ${errs.join(', ')}`);
    }
  }
  const valid = batch.filter((r) => validateRow(r).length === 0);

  if (dryRun) {
    console.log(`\nWould send to ${valid.length} broker(s):`);
    for (const r of valid) {
      console.log(`  - ${r.agent_email}  (${r.neighborhood_id}, ${r.brokerage_name || 'unknown firm'})`);
    }
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const results = [];

  for (let i = 0; i < valid.length; i++) {
    const r = valid[i];
    const prefix = `[${i + 1}/${valid.length}]`;
    const ts = new Date().toISOString();
    try {
      await sendOne(r, resend);
      console.log(`${prefix} SENT  ${r.agent_email}  (${r.neighborhood_id})`);
      results.push({ ...r, sent_at: ts, status: 'sent', notes: r.notes || '' });
    } catch (err) {
      console.log(`${prefix} FAIL  ${r.agent_email}  (${r.neighborhood_id})  ${err.message}`);
      results.push({ ...r, sent_at: ts, status: 'failed', notes: `${r.notes || ''} | send error: ${err.message}`.trim() });
    }
    if (i < valid.length - 1) await new Promise((res) => setTimeout(res, delayMs));
  }

  const logPath = path.join(
    path.dirname(csvPath),
    `${path.basename(csvPath, '.csv')}.sent-log.${Date.now()}.csv`
  );
  fs.writeFileSync(logPath, stringifyCsv(results));
  console.log(`\nLog: ${logPath}`);

  const okCount = results.filter((r) => r.status === 'sent').length;
  console.log(`Summary: ${okCount} / ${valid.length} sent successfully.`);
  if (okCount < valid.length) {
    console.log('Inspect the log CSV for failure reasons. Failed rows can be re-queued (set status back to "queued") and re-run.');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
