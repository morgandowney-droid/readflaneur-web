import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';
import { briefStories, type StoryFlag, type StoryFlags } from '@/lib/story-flags';

/**
 * Private editor desk: every story from a publisher's pilot editions this
 * morning, with the ones an editor should see first at the top. Built for
 * Russmedia's Vorarlberg test (22 Sep 2026). Flags come from
 * src/lib/story-flags.ts via the flag-brief-stories cron.
 *
 * Same posture as the court docket: not linked anywhere, noindex on every
 * response, 404 without a key derived from CRON_SECRET (one key per group), and
 * plain HTML with none of the Flaneur chrome. ?format=json returns the same data.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DeskGroup {
  title: string;
  preparedFor: string;
  timezone: string;
  lang: string;
  /** In the order the publisher numbered them. */
  ids: string[];
}

const DESK_GROUPS: Record<string, DeskGroup> = {
  vorarlberg: {
    title: 'Vorarlberg',
    preparedFor: 'Russmedia',
    timezone: 'Europe/Vienna',
    lang: 'de',
    ids: [
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
      'vorarlberg-lochau',
    ],
  },
};

function deskKey(group: string): string {
  return createHash('sha256')
    .update(`${process.env.CRON_SECRET || ''}:desk:${group}`)
    .digest('hex')
    .slice(0, 24);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

const REASON_LABELS: Record<string, string> = {
  'breaking': 'Breaking',
  'public-safety': 'Public safety',
  'crime-or-court': 'Crime or court',
  'death-or-injury': 'Death or injury',
  'minors': 'Minors',
  'named-person': 'Named person',
  'civic-decision': 'Council decision',
  'planning-or-development': 'Planning',
  'business-change': 'Business',
  'money': 'Money',
  'controversy': 'Controversy',
  'follow-up': 'Follow-up',
};

interface DeskStory {
  index: number;
  title: string;
  category: string;
  summary: string;
  sourceName: string | null;
  sourceUrl: string | null;
  flag: StoryFlag | null;
}

interface DeskArea {
  id: string;
  name: string;
  editionUrl: string | null;
  briefDate: string | null;
  classified: boolean;
  stories: DeskStory[];
}

async function loadDesk(group: DeskGroup, date: string): Promise<DeskArea[]> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const [{ data: hoods }, { data: briefs }] = await Promise.all([
    admin.from('neighborhoods').select('id, name').in('id', group.ids),
    admin.from('neighborhood_briefs')
      .select('id, neighborhood_id, brief_date, enriched_categories, story_flags')
      .in('neighborhood_id', group.ids)
      .eq('brief_date', date)
      .not('enriched_content', 'is', null),
  ]);
  const briefIds = (briefs || []).map((b) => b.id);
  const { data: arts } = briefIds.length
    ? await admin.from('articles').select('brief_id, slug, neighborhood_id').in('brief_id', briefIds).eq('article_type', 'brief_summary').eq('status', 'published')
    : { data: [] as Array<{ brief_id: string; slug: string; neighborhood_id: string }> };

  return group.ids.map((id) => {
    const name = hoods?.find((h) => h.id === id)?.name || id;
    const brief = briefs?.find((b) => b.neighborhood_id === id);
    if (!brief) return { id, name, editionUrl: null, briefDate: null, classified: false, stories: [] };
    const art = arts?.find((a) => a.brief_id === brief.id);
    const editionUrl = art
      ? `https://readflaneur.com/${getCitySlugFromId(id)}/${getNeighborhoodSlugFromId(id)}/${art.slug}?lang=${group.lang}`
      : `https://readflaneur.com/${getCitySlugFromId(id)}/${getNeighborhoodSlugFromId(id)}?lang=${group.lang}`;
    const flags = brief.story_flags as StoryFlags | null;
    const stories: DeskStory[] = briefStories(brief.enriched_categories).map((s) => ({
      ...s,
      flag: flags?.stories?.find((f) => f.index === s.index && f.title === s.title) || null,
    }));
    return { id, name, editionUrl, briefDate: brief.brief_date, classified: Boolean(flags), stories };
  });
}

function rank(s: DeskStory): number {
  if (!s.flag) return 0;
  return (s.flag.importance === 'high' ? 2 : 0) + (s.flag.sensitive ? 1 : 0);
}

function chips(f: StoryFlag): string {
  return f.reasons.map((r) => `<span class="chip">${esc(REASON_LABELS[r] || r)}</span>`).join('');
}

function sourceLink(s: DeskStory): string {
  if (!s.sourceName && !s.sourceUrl) return '';
  const label = esc(s.sourceName || 'Source');
  return s.sourceUrl && /^https?:\/\//.test(s.sourceUrl)
    ? `<a href="${esc(s.sourceUrl)}" rel="noopener noreferrer" target="_blank">${label}</a>`
    : label;
}

function renderHtml(group: DeskGroup, date: string, areas: DeskArea[], jsonHref: string): string {
  const all = areas.flatMap((a) => a.stories.map((s) => ({ area: a, story: s })));
  const first = all.filter((x) => x.story.flag?.editorFirst).sort((a, b) => rank(b.story) - rank(a.story));
  const sensitive = all.filter((x) => x.story.flag?.sensitive).length;
  const live = areas.filter((a) => a.briefDate).length;
  const unclassified = areas.filter((a) => a.briefDate && !a.classified).length;

  const firstList = first.length
    ? `<ol class="first">${first.map(({ area, story }) => {
        const f = story.flag!;
        return `<li class="item${f.sensitive ? ' sens' : ''}">
          <p class="area">${esc(area.name)}${f.importance === 'high' ? '<span class="tag high">Look first</span>' : ''}${f.sensitive ? '<span class="tag check">Legal check</span>' : ''}</p>
          <p class="title">${esc(story.title)}</p>
          ${f.why ? `<p class="why">${esc(f.why)}</p>` : ''}
          <p class="meta">${chips(f)}${story.sourceName || story.sourceUrl ? `<span class="src">Source: ${sourceLink(story)}</span>` : ''}${area.editionUrl ? `<a class="ed" href="${esc(area.editionUrl)}" target="_blank" rel="noopener">Edition</a>` : ''}</p>
          ${f.sensitive ? '<p class="warn">Check before naming anyone: allegations, court matters and injuries carry legal risk, and the source may not say whether a publication restriction applies.</p>' : ''}
        </li>`;
      }).join('')}</ol>`
    : '<p class="none">Nothing flagged this morning. Every story below can go straight into the feed.</p>';

  const areaBlocks = areas.map((a) => {
    const head = `<div class="area-head"><h3>${esc(a.name)}</h3>${a.editionUrl ? `<a href="${esc(a.editionUrl)}" target="_blank" rel="noopener">Read the edition</a>` : ''}</div>`;
    if (!a.briefDate) return `<section class="area-block">${head}<p class="none">No edition yet this morning.</p></section>`;
    const rows = a.stories.map((s) => {
      const f = s.flag;
      const state = !f ? '<span class="state none-yet">Not yet classified</span>'
        : f.editorFirst ? `<span class="state first">${f.sensitive && f.importance !== 'high' ? 'Legal check' : 'Look first'}</span>`
        : `<span class="state feed">Feed</span>`;
      return `<li><span class="st">${esc(s.title)}</span>${s.category ? `<span class="cat">${esc(s.category)}</span>` : ''}${state}${s.sourceName || s.sourceUrl ? `<span class="src">${sourceLink(s)}</span>` : ''}</li>`;
    }).join('');
    return `<section class="area-block">${head}${a.stories.length ? `<ul class="rows">${rows}</ul>` : '<p class="none">No stories this morning.</p>'}</section>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Editor Desk: ${esc(group.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root{
    --ground:#fbfbf9; --ink:#15171a; --muted:#5a6068; --rule:#dcdfe3; --panel:#f1f3f5;
    --hot:#9c1c1c; --hot-soft:#fbeaea; --blue:#1f4e8c; --blue-soft:#e8eff8; --amber:#8a5a00; --amber-soft:#fdf4de;
    --sans:"IBM Plex Sans",-apple-system,"Segoe UI",Roboto,sans-serif;
    --mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
  }
  @media (prefers-color-scheme:dark){:root{
    --ground:#101215; --ink:#e8eaed; --muted:#9aa1ab; --rule:#2a2f36; --panel:#181b20;
    --hot:#ff8a8a; --hot-soft:#2d1717; --blue:#8cb4ff; --blue-soft:#15213a; --amber:#f0c36a; --amber-soft:#2a2210;
  }}
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;background:var(--ground);color:var(--ink);font:15px/1.5 var(--sans);
    padding:env(safe-area-inset-top,0px) 16px calc(48px + env(safe-area-inset-bottom,0px))}
  a{color:var(--blue)}
  a:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
  .wrap{max-width:780px;margin:0 auto}
  .mast{padding-block:28px 18px;border-bottom:3px solid var(--ink)}
  .kicker{font:500 11.5px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
  h1{font-size:30px;line-height:1.1;margin:0 0 8px;letter-spacing:-.01em;text-wrap:balance}
  .dek{margin:0;color:var(--muted);max-width:64ch}
  .stats{display:flex;flex-wrap:wrap;gap:8px 22px;margin:18px 0 0;padding:0;list-style:none;font-variant-numeric:tabular-nums}
  .stats li{font-size:13px;color:var(--muted)}
  .stats b{display:block;font:600 22px/1.1 var(--sans);color:var(--ink)}
  h2{font-size:21px;margin:34px 0 10px;text-wrap:balance}
  .label{font:500 11px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
  ol.first{list-style:none;margin:0;padding:0;display:grid;gap:10px}
  .item{padding:12px 14px;background:var(--panel);border-left:4px solid var(--blue)}
  .item.sens{border-left-color:var(--hot);background:var(--hot-soft)}
  .item p{margin:0}
  .area{font:500 12px/1.4 var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
  .tag{font:600 10.5px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;padding:3px 6px;border-radius:2px;margin-left:8px;white-space:nowrap}
  .tag.high{color:var(--blue);border:1px solid currentColor}
  .tag.check{color:#fff;background:var(--hot)}
  @media (prefers-color-scheme:dark){.tag.check{color:#1a0b0b}}
  .title{font-weight:600;font-size:16.5px;margin-top:4px!important}
  .why{margin-top:3px!important}
  .meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-top:8px!important;font-size:13px;color:var(--muted)}
  .chip{font:500 11px/1 var(--mono);padding:3px 6px;border:1px solid var(--rule);border-radius:2px;color:var(--ink)}
  .ed{font-weight:600}
  .warn{margin-top:8px!important;font-size:12.5px;color:var(--hot)}
  .none{margin:8px 0 0;color:var(--muted);font-size:14px}
  .area-block{margin:18px 0 0;padding-top:12px;border-top:1px solid var(--rule)}
  .area-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px}
  .area-head h3{font-size:17px;margin:0}
  .area-head a{font-size:13px}
  ul.rows{list-style:none;margin:8px 0 0;padding:0}
  ul.rows li{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;padding:6px 0;border-bottom:1px solid var(--rule);font-size:14px}
  .st{font-weight:500;flex:1 1 16rem;min-width:0}
  .cat{font-size:12.5px;color:var(--muted)}
  .state{font:600 10.5px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;padding:3px 6px;border-radius:2px;white-space:nowrap}
  .state.first{color:var(--hot);border:1px solid currentColor}
  .state.feed{color:var(--muted);border:1px solid var(--rule)}
  .state.none-yet{color:var(--amber);background:var(--amber-soft)}
  .src{font-size:12.5px;color:var(--muted)}
  footer{margin-top:44px;padding-top:14px;border-top:3px solid var(--ink);font-size:13px;color:var(--muted)}
  footer p{margin:0 0 8px;max-width:68ch}
  @media (max-width:520px){h1{font-size:25px}}
</style>
</head>
<body>
<div class="wrap">
  <header class="mast">
    <p class="kicker">yous.news · Editor desk · Prepared for ${esc(group.preparedFor)} · Private</p>
    <h1>Editor desk: ${esc(group.title)}</h1>
    <p class="dek">Every story in this morning's editions, ${esc(longDate(date))}. The ones an editor should see before they go into the free feed come first: stories worth a reporter, a follow-up or the paywall, and stories that need a legal check.</p>
    <ul class="stats">
      <li><b>${all.length}</b>stories</li>
      <li><b>${first.length}</b>to look at first</li>
      <li><b>${sensitive}</b>need a legal check</li>
      <li><b>${live}/${areas.length}</b>editions this morning</li>
    </ul>
  </header>
  <h2>Look at these first</h2>
  ${unclassified ? `<p class="none">${unclassified} edition${unclassified === 1 ? ' is' : 's are'} not classified yet. Flags are added within about fifteen minutes of an edition being written.</p>` : ''}
  ${firstList}
  <h2>Every story, by area</h2>
  ${areaBlocks}
  <footer>
    <p><b>How stories are flagged.</b> After each morning's editions are written, every story is read by a model acting as the desk editor. "Look first" means it is likely worth a reporter, a follow-up or the paywall. Separately, fixed rules mark any story that mentions police, courts, deaths, injuries or accidents for a legal check, whatever the model decides.</p>
    <p>The flags sit alongside the editions and do not change what they publish. The same data is available as JSON: <a href="${esc(jsonHref)}">this page as JSON</a>.</p>
  </footer>
</div>
</body>
</html>`;
}

export async function GET(request: Request, { params }: { params: Promise<{ group: string }> }) {
  const { group: groupId } = await params;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  const base = { 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Cache-Control': 'private, no-store' };

  const group = DESK_GROUPS[groupId];
  if (!group || !process.env.CRON_SECRET || key !== deskKey(groupId)) {
    return new Response('Not found', { status: 404, headers: { ...base, 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: group.timezone });
  const dateParam = url.searchParams.get('date') || '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;
  const areas = await loadDesk(group, date);

  if (url.searchParams.get('format') === 'json') {
    const body = {
      group: groupId,
      date,
      areas: areas.map((a) => ({
        id: a.id,
        name: a.name,
        editionUrl: a.editionUrl,
        classified: a.classified,
        stories: a.stories.map((s) => ({
          title: s.title,
          category: s.category,
          summary: s.summary,
          source: s.sourceName || s.sourceUrl ? { name: s.sourceName, url: s.sourceUrl } : null,
          editorFirst: s.flag?.editorFirst ?? null,
          importance: s.flag?.importance ?? null,
          sensitive: s.flag?.sensitive ?? null,
          reasons: s.flag?.reasons ?? [],
          why: s.flag?.why ?? null,
        })),
      })),
    };
    return new Response(JSON.stringify(body, null, 2), { headers: { ...base, 'Content-Type': 'application/json; charset=utf-8' } });
  }

  const jsonUrl = new URL(url);
  jsonUrl.searchParams.set('format', 'json');
  return new Response(renderHtml(group, date, areas, `${jsonUrl.pathname}${jsonUrl.search}`), {
    headers: { ...base, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
