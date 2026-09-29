import { createClient } from '@supabase/supabase-js';
import { checkEditorKey, getEditorGroup, isFeedLanguage, notFound, PRIVATE_HEADERS } from '@/lib/editor-desk';
import { loadVoiceChoices, resolveEditionVoice, VOICE_CHOICE_TABLE, type VoiceChoiceRow } from '@/lib/edition-audio';
import { italianCity } from '@/lib/italian-display';
import type { Edition } from '@/lib/licensee-feed';
import type { FeedLanguage } from '@/lib/licensees';
import { customerVoiceLabel, DEFAULT_LABEL, voiceOptionsFor, type VoiceLabel } from '@/lib/voice-options';
import { ensureSample, listSamples, loadEditions, runLimited, sampleSource, type SampleResult, type SampleSource } from '@/lib/voice-samples';

/**
 * The publisher chooses the voice of its audio edition (29 Sep 2026).
 *
 * /editor/[group]/voices?key=&edition=<id>: for each edition in the group (or
 * the one named), five players A to E reading the same text, the start of that
 * edition's most recent audio. The publisher's own editors pick by ear; we are
 * not native speakers. No provider, model or voice name appears anywhere on
 * this page or in a file name it shows: only "Voce A" to "Voce E". A is the
 * default. "Choose this voice" posts to ./voices/choose; the edition's audio
 * uses the choice from the next morning's run.
 *
 * Same posture as the desk: 404 without the desk key, noindex, no-store,
 * no-referrer. The editor's name comes from the desk's cookie.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// First view renders up to five samples per edition.
export const maxDuration = 120;

const RENDER_BUDGET_MS = 80_000;

const STRINGS = {
  en: {
    title: 'Voice for the audio edition: {p}',
    kicker: 'Audio edition · Prepared for {p} · Private',
    intro: 'Listen to the five voices below. Each reads the same text: the start of this area\'s most recent audio edition. Choose the one that sounds right to your readers. Voice A is the default.',
    next: 'From the next morning\'s edition, the audio uses the voice you choose. You can change it at any time.',
    name: 'Your name',
    namePh: 'Type it once, kept on this device',
    desk: 'Back to the editor desk',
    edNo: 'Area {i} of {n}',
    jump: 'Areas',
    voice: 'Voice {l}',
    female: 'Female voice',
    male: 'Male voice',
    isDefault: 'Default',
    current: 'In use',
    choose: 'Choose this voice',
    chosen: 'Chosen',
    currentChoice: 'Current voice: {v}, chosen by {who} on {when}.',
    currentDefault: 'Current voice: {v} (default).',
    currentConfigured: 'Current voice: {v} (set up for this area).',
    currentOther: 'Current voice: the one set up for this area, not one of A to E. Choosing one below replaces it.',
    readFrom: 'Text read: the audio edition of {d}.',
    readFromBrief: 'Text read: the Daily Brief of {d}, since this area has no audio edition yet.',
    noText: 'There is no text for this area in this language yet, so there are no samples. Try again after the next morning\'s edition.',
    unavailable: 'This sample is not available right now. Reload the page to try again.',
    preparing: 'This sample is still being prepared. Reload the page in a minute.',
    needName: 'Type your name at the top first, so the record says who chose.',
    saved: 'Saved. From the next morning\'s edition, this area uses {v}.',
    failed: 'Not saved: ',
    tableMissing: 'Choices cannot be saved yet: this is still being set up. The samples can be heard; the buttons will work shortly.',
  },
  it: {
    title: "Voce dell'edizione audio: {p}",
    kicker: 'Edizione audio · Preparato per {p} · Riservato',
    intro: "Ascoltate le cinque voci qui sotto. Ognuna legge lo stesso testo: l'inizio dell'edizione audio più recente di questo quartiere. Scegliete quella più adatta ai vostri lettori. La voce A è quella predefinita.",
    next: "Dall'edizione di domattina, l'audio userà la voce scelta. Potete cambiarla in qualsiasi momento.",
    name: 'Il tuo nome',
    namePh: 'Da inserire una volta, resta su questo dispositivo',
    desk: 'Torna al desk redazionale',
    edNo: 'Quartiere {i} di {n}',
    jump: 'Quartieri',
    voice: 'Voce {l}',
    female: 'Voce femminile',
    male: 'Voce maschile',
    isDefault: 'Predefinita',
    current: 'In uso',
    choose: 'Scegli questa voce',
    chosen: 'Scelta',
    currentChoice: 'Voce attuale: {v}, scelta da {who} il {when}.',
    currentDefault: 'Voce attuale: {v} (predefinita).',
    currentConfigured: 'Voce attuale: {v} (impostata per questo quartiere).',
    currentOther: 'Voce attuale: quella impostata per questo quartiere, non una tra A ed E. Sceglierne una qui sotto la sostituisce.',
    readFrom: "Testo letto: l'edizione audio del {d}.",
    readFromBrief: "Testo letto: il punto del giorno del {d}, perché questo quartiere non ha ancora un'edizione audio.",
    noText: "Non c'è ancora un testo in questa lingua per questo quartiere, quindi nessun campione. Riprovate dopo l'edizione di domattina.",
    unavailable: 'Questo campione al momento non è disponibile. Ricaricate la pagina per riprovare.',
    preparing: 'Questo campione è ancora in preparazione. Ricaricate la pagina tra un minuto.',
    needName: 'Inserisci prima il tuo nome in alto, così resta traccia di chi ha scelto.',
    saved: "Salvato. Dall'edizione di domattina, questo quartiere usa la {v}.",
    failed: 'Non salvato: ',
    tableMissing: 'Le scelte non possono ancora essere salvate: la funzione è in fase di attivazione. I campioni sono ascoltabili; i pulsanti funzioneranno a breve.',
  },
};
type Strings = typeof STRINGS.en;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

function longDate(iso: string, lang: FeedLanguage): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

interface EditionView {
  edition: Edition;
  src: SampleSource | null;
  samples: Map<VoiceLabel, SampleResult | 'preparing'>;
  choice: VoiceChoiceRow | null;
  currentLabel: VoiceLabel | null;
  currentSource: 'choice' | 'edition' | 'default';
}

function currentLine(v: EditionView, s: Strings, lang: FeedLanguage, tz: string): string {
  if (v.currentLabel && v.currentSource === 'choice' && v.choice) {
    const when = v.choice.chosen_at
      ? new Date(v.choice.chosen_at).toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB', { timeZone: tz, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
      : '';
    return fmt(s.currentChoice, { v: customerVoiceLabel(v.currentLabel, lang), who: esc(v.choice.chosen_by || ''), when: esc(when) });
  }
  if (v.currentLabel) return fmt(v.currentSource === 'edition' ? s.currentConfigured : s.currentDefault, { v: customerVoiceLabel(v.currentLabel, lang) });
  return s.currentOther;
}

function editionHtml(v: EditionView, s: Strings, lang: FeedLanguage, audioLang: FeedLanguage, idx: number, total: number): string {
  const e = v.edition;
  const options = voiceOptionsFor(audioLang);
  const head = `<header class="ed-head"><div><p class="ed-no">${esc(fmt(s.edNo, { i: idx + 1, n: total }))}</p><h2>${esc(e.name)}</h2><p class="sub">${esc(lang === 'it' ? italianCity(e.city) : e.city)}</p></div></header>`;
  const current = `<p class="current" data-current>${currentLine(v, s, lang, e.timezone)}</p>`;
  if (!v.src) return `<section class="edition" id="ed-${esc(e.id)}">${head}${current}<p class="muted">${s.noText}</p></section>`;
  const readFrom = `<p class="muted small">${esc(fmt(v.src.from === 'audio' ? s.readFrom : s.readFromBrief, { d: longDate(v.src.date, lang) }))}</p>`;
  const cards = options
    .map((o) => {
      const r = v.samples.get(o.label);
      const player = r === 'preparing' || !r
        ? `<p class="muted small">${s.preparing}</p>`
        : r.url
          ? `<audio controls preload="none" src="${esc(r.url)}"></audio>`
          : `<p class="muted small">${s.unavailable}</p>`;
      const inUse = v.currentLabel === o.label;
      const tags = [
        o.label === DEFAULT_LABEL ? `<span class="tag">${s.isDefault}</span>` : '',
        `<span class="tag in-use"${inUse ? '' : ' hidden'}>${s.current}</span>`,
      ].join('');
      return `<div class="opt${inUse ? ' on' : ''}" data-label="${o.label}">
        <div class="opt-top"><h3>${esc(fmt(s.voice, { l: o.label }))}</h3>${tags}</div>
        <p class="muted small">${o.gender === 'female' ? s.female : s.male}</p>
        ${player}
        <button type="button" class="b primary" data-choose="${o.label}" data-edition="${esc(e.id)}"${inUse ? ' disabled' : ''}>${inUse ? s.chosen : s.choose}</button>
      </div>`;
    })
    .join('');
  return `<section class="edition" id="ed-${esc(e.id)}" data-edition="${esc(e.id)}">${head}${current}${readFrom}<div class="opts">${cards}</div></section>`;
}

function renderPage(opts: { publisher: string; groupId: string; key: string; lang: FeedLanguage; audioLang: FeedLanguage; views: EditionView[]; tableMissing: boolean }): string {
  const { publisher, groupId, key, lang, views } = opts;
  const s = lang === 'it' ? STRINGS.it : STRINGS.en;
  const base = `/editor/${encodeURIComponent(groupId)}`;
  const client = {
    needName: s.needName, saved: s.saved, failed: s.failed, chosen: s.chosen, choose: s.choose,
    voice: s.voice, currentChoice: s.currentChoice,
  };
  const jump = views.length > 1
    ? `<nav class="jump" aria-label="${s.jump}"><span class="jl">${s.jump}</span>${views.map((v, i) => `<a href="#ed-${esc(v.edition.id)}"><b>${i + 1}</b> ${esc(v.edition.name)}</a>`).join('')}</nav>`
    : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="referrer" content="no-referrer">
<title>${esc(fmt(s.title, { p: publisher }))}</title>
<script>try{var t=localStorage.getItem('flaneur-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Merriweather:wght@400;700&family=Inter:wght@400;500;600&display=swap">
<style>
  :root{
    --canvas:#fafaf9; --surface:#ffffff; --elevated:#f5f5f4; --fg:#1c1917; --muted:#57534e; --subtle:#78716c;
    --border:rgba(0,0,0,.09); --border-strong:rgba(0,0,0,.18); --accent:#8a7a68; --ok:#3f6212; --ok-soft:#ecf3e0; --held:#9a3412; --held-soft:#fbeee6;
    --serif:"Merriweather",Georgia,"Times New Roman",serif; --display:"Cormorant Garamond",Georgia,serif;
    --sans:"Inter",-apple-system,"Segoe UI",Roboto,sans-serif;
    color-scheme:light;
  }
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
    --canvas:#050505; --surface:#121212; --elevated:#1a1a1a; --fg:#e5e5e5; --muted:#a3a3a3; --subtle:#737373;
    --border:rgba(255,255,255,.09); --border-strong:rgba(255,255,255,.2); --accent:#c9b99a; --ok:#a3c77a; --ok-soft:#18200f; --held:#f0a47a; --held-soft:#2a1810;
    color-scheme:dark;
  }}
  :root[data-theme="dark"]{
    --canvas:#050505; --surface:#121212; --elevated:#1a1a1a; --fg:#e5e5e5; --muted:#a3a3a3; --subtle:#737373;
    --border:rgba(255,255,255,.09); --border-strong:rgba(255,255,255,.2); --accent:#c9b99a; --ok:#a3c77a; --ok-soft:#18200f; --held:#f0a47a; --held-soft:#2a1810;
    color-scheme:dark;
  }
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;background:var(--canvas);color:var(--fg);font:15px/1.5 var(--sans);overflow-x:clip}
  a{color:inherit;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px;text-decoration-color:var(--subtle)}
  button,input{font:inherit;color:inherit}
  .wrap{max-width:820px;margin:0 auto;padding:0 16px calc(56px + env(safe-area-inset-bottom,0px))}
  .mast{padding:32px 0 20px;border-bottom:1px solid var(--border-strong)}
  .kicker{font:500 11px/1.4 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--subtle);margin:0 0 10px}
  h1{font:600 36px/1.05 var(--display);margin:0 0 10px}
  .intro{margin:0;max-width:70ch;font:400 15px/1.6 var(--serif)}
  .next{margin:12px 0 0;padding:10px 12px;border-left:2px solid var(--accent);background:var(--surface);font-weight:600}
  .bar{padding:12px 0;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:10px 16px;align-items:end}
  .bar label{display:flex;flex-direction:column;gap:3px;font:500 11px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--subtle)}
  .bar input{font:400 15px/1.3 var(--sans);letter-spacing:0;text-transform:none;color:var(--fg);background:var(--surface);border:1px solid var(--border-strong);border-radius:6px;padding:7px 9px;width:min(260px,70vw)}
  .alert{margin:14px 0 0;padding:10px 12px;border:1px solid var(--held);color:var(--held);background:var(--held-soft);border-radius:6px;font-size:14px}
  .jump{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:18px 0 0}
  .jump .jl{font:500 11px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--subtle);margin-right:4px}
  .jump a{text-decoration:none;border:1px solid var(--border-strong);border-radius:999px;padding:6px 12px;font-size:13.5px;background:var(--surface)}
  .jump a b{margin-right:4px;color:var(--subtle)}
  .edition{margin-top:44px;scroll-margin-top:12px}
  .edition+.edition{border-top:3px double var(--border-strong);padding-top:36px}
  .ed-head{background:var(--fg);color:var(--canvas);border-radius:10px;padding:16px 18px}
  .ed-head h2{font:600 30px/1.05 var(--display);margin:0}
  .ed-head .sub{margin:4px 0 0;opacity:.72;font-size:13px}
  .ed-no{font:600 11px/1.3 var(--sans);letter-spacing:.16em;text-transform:uppercase;margin:0 0 6px;opacity:.7}
  .current{margin:14px 0 4px;font-weight:600}
  .muted{color:var(--muted)} .small{font-size:13px}
  .opts{display:grid;gap:10px;margin-top:12px}
  @media (min-width:640px){.opts{grid-template-columns:1fr 1fr}}
  .opt{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--border-strong);border-radius:8px;padding:14px}
  .opt.on{border-left-color:var(--ok)}
  .opt-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .opt h3{font:600 22px/1.1 var(--display);margin:0}
  .opt p{margin:4px 0 8px}
  .tag{font:600 10.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;padding:4px 7px;border-radius:4px;background:var(--elevated);color:var(--muted)}
  .tag.in-use{background:var(--ok-soft);color:var(--ok)}
  .tag[hidden]{display:none}
  .opt audio{width:100%;display:block;margin:0 0 10px}
  .b{appearance:none;cursor:pointer;border:1px solid var(--border-strong);background:transparent;border-radius:6px;padding:8px 12px;font:500 13.5px/1 var(--sans);min-height:36px}
  .b.primary{background:var(--fg);color:var(--canvas);border-color:var(--fg)}
  .b[disabled]{opacity:.55;cursor:default}
  .toast{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--fg);color:var(--canvas);padding:9px 14px;border-radius:8px;font-size:14px;max-width:calc(100vw - 32px);z-index:10}
  .toast[hidden]{display:none}
  @media (max-width:520px){h1{font-size:30px}.ed-head h2{font-size:25px}}
</style>
</head>
<body>
<div class="wrap">
  <header class="mast">
    <p class="kicker">${esc(fmt(s.kicker, { p: publisher }))}</p>
    <h1>${esc(fmt(s.title, { p: publisher }))}</h1>
    <p class="intro">${s.intro}</p>
    <p class="next">${s.next}</p>
    ${opts.tableMissing ? `<p class="alert">${s.tableMissing}</p>` : ''}
  </header>
  <div class="bar">
    <label>${s.name}<input id="who" type="text" maxlength="80" autocomplete="name" placeholder="${esc(s.namePh)}"></label>
    <a href="${base}?key=${encodeURIComponent(key)}&lang=${lang}">${s.desk}</a>
  </div>
  ${jump}
  ${views.map((v, i) => editionHtml(v, s, lang, opts.audioLang, i, views.length)).join('')}
</div>
<div class="toast" data-toast hidden></div>
<script>
(function(){
  var S=${JSON.stringify(client).replace(/</g, '\\u003c')};
  var ENDPOINT=${JSON.stringify(`${base}/voices/choose?key=${encodeURIComponent(key)}`)};
  var COOKIE='flaneur-editor-name';
  var who=document.getElementById('who');
  var m=document.cookie.match(/(?:^|; )flaneur-editor-name=([^;]*)/);who.value=m?decodeURIComponent(m[1]):'';
  function setCookie(v){document.cookie=COOKIE+'='+encodeURIComponent(v)+'; path=/editor; max-age=31536000; SameSite=Strict';}
  who.addEventListener('change',function(){setCookie(who.value.trim());});
  var toastEl=document.querySelector('[data-toast]');var tt;
  function toast(msg){toastEl.textContent=msg;toastEl.hidden=false;clearTimeout(tt);tt=setTimeout(function(){toastEl.hidden=true;},5000);}
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-choose]');if(!b)return;
    var name=who.value.trim();
    if(!name){toast(S.needName);who.focus();return;}
    setCookie(name);
    var label=b.getAttribute('data-choose'),edition=b.getAttribute('data-edition');
    b.disabled=true;
    fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({edition:edition,label:label,name:name})})
      .then(function(res){return res.json().then(function(j){return {ok:res.ok,j:j};});})
      .then(function(x){
        if(!x.ok||!x.j.ok){b.disabled=false;toast(S.failed+((x.j&&x.j.error)||'error'));return;}
        var sec=b.closest('.edition');var v=S.voice.replace('{l}',label);
        sec.querySelectorAll('.opt').forEach(function(o){
          var on=o.getAttribute('data-label')===label;o.classList.toggle('on',on);
          var tag=o.querySelector('.tag.in-use');if(tag)tag.hidden=!on;
          var btn=o.querySelector('[data-choose]');btn.disabled=on;btn.textContent=on?S.chosen:S.choose;
        });
        var cur=sec.querySelector('[data-current]');if(cur)cur.textContent=S.currentChoice.replace('{v}',v).replace('{who}',x.j.chosen_by).replace('{when}',new Date(x.j.chosen_at).toLocaleString());
        toast(S.saved.replace('{v}',v));
      })
      .catch(function(){b.disabled=false;toast(S.failed+'network');});
  });
})();
</script>
</body>
</html>`;
}

export async function GET(request: Request, { params }: { params: Promise<{ group: string }> }) {
  const { group: groupId } = await params;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  const group = getEditorGroup(groupId);
  if (!group || !checkEditorKey(groupId, key)) return notFound();

  const editionParam = url.searchParams.get('edition');
  if (editionParam && !group.licensee.editions.includes(editionParam)) return notFound();
  const refresh = url.searchParams.get('refresh') === '1';
  const langParam = url.searchParams.get('lang');
  // Samples are always in the group's audio language; only the page chrome follows ?lang=.
  const audioLang: FeedLanguage = group.licensee.defaultLang || 'en';
  const uiLang: FeedLanguage = isFeedLanguage(langParam) ? langParam : audioLang;

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const ids = editionParam ? [editionParam] : group.licensee.editions;
  const [editions, choices, tableCheck] = await Promise.all([
    loadEditions(admin, ids),
    loadVoiceChoices(admin, [...ids]),
    admin.from(VOICE_CHOICE_TABLE).select('neighborhood_id').limit(1)
      .then((r) => Boolean(r.error), () => true),
  ]);
  const options = voiceOptionsFor(audioLang);

  const views: EditionView[] = await Promise.all(
    editions.map(async (edition) => {
      const choice = choices.get(edition.id) || null;
      const resolved = resolveEditionVoice(edition.id, audioLang, choice);
      const [src, existing] = await Promise.all([sampleSource(admin, edition, audioLang), listSamples(admin, edition.id)]);
      return {
        edition, src, samples: new Map(), choice,
        currentLabel: resolved.label, currentSource: resolved.source,
        existing,
      } as EditionView & { existing: Set<string> };
    }),
  );

  // Render missing samples, a few at a time, within the page's budget.
  const jobs: Array<{ v: EditionView; label: VoiceLabel; run: () => Promise<SampleResult> }> = [];
  for (const v of views as Array<EditionView & { existing: Set<string> }>) {
    if (!v.src) continue;
    for (const o of options) {
      const src = v.src;
      jobs.push({ v, label: o.label, run: () => ensureSample(admin, v.edition.id, audioLang, o, src, v.existing, refresh) });
    }
  }
  const results = await runLimited(jobs.map((j) => j.run), 6, RENDER_BUDGET_MS, () => null as unknown as SampleResult);
  jobs.forEach((j, i) => {
    const r = results[i];
    if (r && r.error) console.warn(`[voices] ${j.v.edition.id} ${j.label}: ${r.error}`);
    j.v.samples.set(j.label, r || 'preparing');
  });

  return new Response(renderPage({ publisher: group.publisher, groupId: group.id, key, lang: uiLang, audioLang, views, tableMissing: tableCheck }), {
    headers: { ...PRIVATE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
