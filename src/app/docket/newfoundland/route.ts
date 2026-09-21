import { createHash } from 'crypto';
import {
  buildTipSheet,
  fetchNlDocket,
  FEATURED_CENTRES,
  NL_COURT_CENTRES,
  type CentreDay,
  type ScoredAppearance,
} from '@/lib/nl-docket';

/**
 * Private court-docket tip sheet for the Canadian Press. See src/lib/nl-docket.ts.
 *
 * Not linked from anywhere, not in the sitemap, noindex on every response, and
 * gated by a key derived from CRON_SECRET, so the cron secret itself never goes
 * into a URL someone might forward. The route renders plain HTML so it carries
 * none of the Flaneur site chrome.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function docketKey(): string {
  return createHash('sha256')
    .update(`${process.env.CRON_SECRET || ''}:nl-docket-preview`)
    .digest('hex')
    .slice(0, 24);
}

const TZ = 'America/St_Johns';

function localToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-CA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** "COLLINS, CLIFFORD RUBEN" -> "Clifford Ruben Collins" */
function displayName(raw: string): string {
  const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\bMc([a-z])/g, (_m, c) => `Mc${c.toUpperCase()}`);
  const [last, first] = raw.split(',').map((p) => p.trim());
  return first ? `${title(first)} ${title(last)}` : title(raw);
}

function chargeList(a: ScoredAppearance): string {
  const seen = new Set<string>();
  return a.charges
    .filter((c) => (seen.has(c.description) ? false : (seen.add(c.description), true)))
    .map((c) => `<li>${esc(c.description)}${c.section ? ` <span class="sec">${esc(c.statute)} ${esc(c.section)}</span>` : ''}</li>`)
    .join('');
}

function flaggedItem(a: ScoredAppearance): string {
  return `
      <li class="item ${a.tier}">
        <div class="when"><span class="t">${esc(a.time)}</span><span class="room">${esc(a.courtroom)}</span></div>
        <div class="body">
          <p class="who">${esc(displayName(a.accused))}<span class="stage">${esc(a.stageLabel)}</span>${a.tier === 'lead' ? '<span class="lead-tag">Lead</span>' : ''}</p>
          <p class="why">${esc(a.why.charAt(0).toUpperCase() + a.why.slice(1))}.</p>
          <details><summary>${a.charges.length} charge${a.charges.length === 1 ? '' : 's'} on the list</summary><ul class="charges">${chargeList(a)}</ul></details>
          ${a.sensitivity ? `<p class="ban strong">${esc(a.sensitivity)}</p>` : `<p class="ban">Check with the ${esc(a.centre)} registry for a publication ban before naming anyone.</p>`}
        </div>
      </li>`;
}

function centreBlock(d: CentreDay): string {
  const routine = d.routineByCharge
    .slice(0, 8)
    .map((r) => `${r.count} ${esc(r.description.toLowerCase())}`)
    .join(' · ');
  const featured = FEATURED_CENTRES.includes(d.centre);
  return `
    <section class="centre${featured ? ' featured' : ''}">
      <header class="centre-head">
        <h3>${esc(d.centre)}${featured ? '<span class="named">Named by CP</span>' : ''}</h3>
        <p class="counts"><b>${d.flagged.length}</b> worth a reporter · ${d.routineCount} routine</p>
      </header>
      ${d.flagged.length ? `<ol class="items">${d.flagged.map(flaggedItem).join('')}</ol>` : '<p class="none">Nothing on this list that would send a reporter to court.</p>'}
      ${d.routineCount ? `<p class="routine"><span>Also listed:</span> ${routine}${d.routineByCharge.length > 8 ? ' · and more' : ''}</p>` : ''}
    </section>`;
}

function render(sheet: CentreDay[], start: string, days: number, generatedAt: string, error?: string): string {
  const dates = [...new Set(sheet.map((d) => d.date))].sort();
  const flagged = sheet.reduce((n, d) => n + d.flagged.length, 0);
  const total = sheet.reduce((n, d) => n + d.flagged.length + d.routineCount, 0);
  const leads = sheet.reduce((n, d) => n + d.flagged.filter((f) => f.tier === 'lead').length, 0);

  const byDay = dates
    .map((date) => {
      const blocks = sheet.filter((d) => d.date === date);
      // The day's best five across the province, so an editor with one
      // reporter to place can decide without reading every centre.
      const top = blocks
        .flatMap((b) => b.flagged)
        .sort((x, y) => y.score - x.score)
        .slice(0, 5);
      const topList = top.length
        ? `<ol class="top">${top
            .map((a) => `<li><span class="tt">${esc(a.time)}</span><span class="tc">${esc(a.centre)}</span><span class="tw">${esc(displayName(a.accused))}: ${esc(a.why)}.${a.sensitivity ? ' <span class="tban">Likely ban. Check first.</span>' : ''}</span></li>`)
            .join('')}</ol>`
        : '';
      return `
  <section class="day" id="d-${date}">
    <h2>${esc(dayLabel(date))}</h2>
    ${top.length ? `<p class="top-label">The day's five</p>${topList}` : ''}
    ${blocks.map(centreBlock).join('')}
  </section>`;
    })
    .join('');

  const nav = dates
    .map((d) => `<a href="#d-${d}">${esc(dayLabel(d).split(',')[0])}</a>`)
    .join('');

  return `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Court Docket: Newfoundland and Labrador</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root{
    --ground:#fbfbf9; --ink:#15171a; --muted:#5a6068; --rule:#dcdfe3; --panel:#f1f3f5;
    --lead:#9c1c1c; --lead-soft:#fbeaea; --watch:#1f4e8c; --watch-soft:#e8eff8;
    --ban:#8a5a00; --ban-soft:#fdf4de;
    --sans:"IBM Plex Sans",-apple-system,"Segoe UI",Roboto,sans-serif;
    --mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
  }
  @media (prefers-color-scheme:dark){:root{
    --ground:#101215; --ink:#e8eaed; --muted:#9aa1ab; --rule:#2a2f36; --panel:#181b20;
    --lead:#ff8a8a; --lead-soft:#2d1717; --watch:#8cb4ff; --watch-soft:#15213a;
    --ban:#f0c36a; --ban-soft:#2a2210;
  }}
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;background:var(--ground);color:var(--ink);font:15px/1.5 var(--sans);
    padding:env(safe-area-inset-top,0px) 16px calc(48px + env(safe-area-inset-bottom,0px))}
  .wrap{max-width:760px;margin:0 auto}
  .mast{padding-block:28px 18px;border-bottom:3px solid var(--ink)}
  .kicker{font:500 11.5px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
  h1{font-size:30px;line-height:1.1;margin:0 0 8px;letter-spacing:-.01em;text-wrap:balance}
  .dek{margin:0;color:var(--muted);max-width:62ch}
  .stats{display:flex;flex-wrap:wrap;gap:8px 22px;margin:18px 0 0;padding:0;list-style:none;font-variant-numeric:tabular-nums}
  .stats li{font-size:13px;color:var(--muted)}
  .stats b{display:block;font:600 22px/1.1 var(--sans);color:var(--ink)}
  .legal{margin:18px 0 0;padding:12px 14px;background:var(--ban-soft);border-left:4px solid var(--ban);font-size:13.5px}
  .legal p{margin:0 0 6px}.legal p:last-child{margin:0}
  nav.days{position:sticky;top:env(safe-area-inset-top,0px);z-index:3;background:var(--ground);display:flex;flex-wrap:wrap;gap:4px 18px;
    padding:10px 0;border-bottom:1px solid var(--rule);font:500 13px var(--mono)}
  nav.days a{color:var(--ink);text-decoration:none;border-bottom:2px solid transparent}
  nav.days a:hover,nav.days a:focus-visible{border-bottom-color:var(--ink);outline:none}
  .day h2{font-size:21px;margin:34px 0 4px;text-wrap:balance}
  .top-label{font:500 11px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:14px 0 6px}
  ol.top{list-style:none;margin:0;padding:0;border-top:2px solid var(--ink)}
  ol.top li{display:grid;grid-template-columns:4.8rem 9.5rem 1fr;gap:10px;padding:7px 0;border-bottom:1px solid var(--rule);font-size:14px}
  .tt{font:500 13px var(--mono);font-variant-numeric:tabular-nums}
  .tc{font-weight:600}
  .tban{font:600 11px var(--mono);color:var(--ban);white-space:nowrap}
  .centre{margin:18px 0 0;padding-top:14px;border-top:1px solid var(--rule)}
  .centre-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px}
  .centre h3{font-size:17px;margin:0}
  .named{font:500 10.5px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--watch);background:var(--watch-soft);
    padding:3px 6px;border-radius:2px;margin-left:10px;vertical-align:2px}
  .counts{margin:0;font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
  .counts b{color:var(--ink)}
  ol.items{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:10px}
  .item{display:grid;grid-template-columns:5.6rem 1fr;gap:14px;padding:12px 14px;background:var(--panel);border-left:4px solid var(--watch)}
  .item.lead{border-left-color:var(--lead);background:var(--lead-soft)}
  .when{font:500 13px/1.3 var(--mono);font-variant-numeric:tabular-nums}
  .when .t{display:block;font-size:15px}
  .when .room{display:block;color:var(--muted);font-size:11.5px;margin-top:3px}
  .who{margin:0;font-weight:600;font-size:16px}
  .stage,.lead-tag{font:500 10.5px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;padding:3px 6px;border-radius:2px;margin-left:8px;
    vertical-align:2px;white-space:nowrap}
  .stage{color:var(--watch);border:1px solid currentColor}
  .lead-tag{color:#fff;background:var(--lead)}
  @media (prefers-color-scheme:dark){.lead-tag{color:#1a0b0b}}
  .why{margin:4px 0 6px}
  details{font-size:13.5px;color:var(--muted)}
  summary{cursor:pointer;width:max-content;max-width:100%}
  summary:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
  ul.charges{margin:6px 0 2px;padding-left:18px}
  ul.charges li{margin:2px 0}
  .sec{font:12px var(--mono);color:var(--muted);white-space:nowrap}
  .ban{margin:8px 0 0;font-size:12.5px;color:var(--ban)}
  .ban.strong{font-weight:600}
  .none{margin:8px 0 0;color:var(--muted);font-size:14px}
  .routine{margin:10px 0 0;font-size:13px;color:var(--muted)}
  .routine span{font:500 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink);margin-right:4px}
  footer{margin-top:44px;padding-top:14px;border-top:3px solid var(--ink);font-size:13px;color:var(--muted)}
  footer p{margin:0 0 8px;max-width:68ch}
  .err{margin:24px 0;padding:14px;border-left:4px solid var(--lead);background:var(--lead-soft)}
  @media (max-width:520px){
    h1{font-size:25px}
    .item{grid-template-columns:1fr;gap:6px}
    .when .t,.when .room{display:inline;margin:0 8px 0 0}
    ol.top li{grid-template-columns:4.2rem 1fr}
    .tw{grid-column:1 / -1}
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="mast">
    <p class="kicker">yous.news · Prototype for the Canadian Press · Private</p>
    <h1>Court docket: Newfoundland and Labrador</h1>
    <p class="dek">The Provincial Court's public criminal docket, read every morning and sorted for a newsroom. The appearances worth a reporter come first. Routine matters are counted, not listed.</p>
    <ul class="stats">
      <li><b>${total}</b>criminal appearances</li>
      <li><b>${flagged}</b>worth a reporter</li>
      <li><b>${leads}</b>leads</li>
      <li><b>${Object.keys(NL_COURT_CENTRES).length}</b>court centres</li>
      <li><b>${days}</b>days from ${esc(dayLabel(start))}</li>
    </ul>
    <div class="legal">
      <p><b>Not for publication.</b> This is a tip sheet for editors deciding where to send a reporter. It publishes nothing.</p>
      <p><b>The court's docket does not show publication bans.</b> Every item below says so, and sexual and intimate-partner cases carry a stronger warning. Confirm with the court registry before naming anyone.</p>
      <p><b>Youth Court matters are excluded</b>, as the Youth Criminal Justice Act requires.</p>
    </div>
  </header>
  ${dates.length ? `<nav class="days" aria-label="Days">${nav}</nav>` : ''}
  ${error ? `<div class="err"><b>The court docket could not be read just now.</b> ${esc(error)} Try again in a few minutes.</div>` : ''}
  ${!error && !dates.length ? '<p class="none">No criminal matters listed for these days.</p>' : ''}
  ${byDay}
  <footer>
    <p><b>Source:</b> the Provincial Court of Newfoundland and Labrador public docket, docket.court.nl.ca, read at ${esc(generatedAt)} Newfoundland time and refreshed every half hour. Nothing is stored.</p>
    <p><b>How items are chosen:</b> by the most serious charge on the list and by what is due to happen. A trial, a sentencing, a possible guilty plea or a first appearance on a serious charge is flagged. Status hearings and adjournments on minor charges are counted.</p>
    <p>The court notes that listed matters can change up to the time they are called.</p>
  </footer>
</div>
</body>
</html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Cache-Control': 'private, no-store',
  };

  if (!process.env.CRON_SECRET || key !== docketKey()) {
    return new Response('Not found', { status: 404, headers });
  }

  const start = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('start') || '') ? url.searchParams.get('start')! : localToday();
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 5, 1), 10);
  const generatedAt = new Date().toLocaleString('en-CA', {
    timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short',
  });

  try {
    const sheet = buildTipSheet(await fetchNlDocket(start, days));
    return new Response(render(sheet, start, days, generatedAt), { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return new Response(render([], start, days, generatedAt, message), { status: 200, headers });
  }
}
