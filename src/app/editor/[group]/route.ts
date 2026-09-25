import { createClient } from '@supabase/supabase-js';
import {
  checkEditorKey,
  getEditorGroup,
  isFeedLanguage,
  loadDeskDay,
  notFound,
  PRIVATE_HEADERS,
  type DeskDay,
  type DeskEdition,
  type DeskItem,
  type DeskSource,
} from '@/lib/editor-desk';
import type { LoggedRemoval } from '@/lib/editorial-decisions';
import type { FeedLanguage } from '@/lib/licensees';
import { judgeLabel } from '@/lib/social-judge-core';

/**
 * Private editor desk for a licensee whose feed requires approval.
 *
 * GEDI (25 Sep 2026): a human must check anything before it runs under their
 * logo, and their editors want to select, change and push the feed. Each
 * morning's stories for the group's editions, with stakes, sources, archived
 * copies, the source check and what the edition rules cut; Approve, Hold,
 * Edit and Restore per item; the decisions govern only that licensee's feed
 * (/api/v1). The public showroom pages keep publishing as before.
 *
 * Same posture as /desk: not linked anywhere, 404 without a key derived from
 * CRON_SECRET (scope `editor`), noindex, no-store, disallowed in robots.
 * Plain server-rendered HTML with a small inline script for the actions.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The first view in a language nobody has read yet translates on demand.
export const maxDuration = 120;

// ─── UI strings ────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    judgeLang: 'en' as 'en' | 'it',
    kicker: 'Editor desk · Prepared for {p} · Private',
    title: 'Editor desk: {p}',
    governs: 'This governs what your feed carries; the showroom page is unchanged.',
    how: 'Nothing reaches your feed until an editor approves it. Pending and held items are left out. An edit is saved as your wording and approves the item.',
    name: 'Your name',
    namePh: 'Type it once, kept on this device',
    date: 'Date',
    show: 'Show',
    language: 'Language',
    dailyBrief: 'Daily Brief',
    lookAhead: 'Look Ahead',
    headline: 'Headline',
    laText: 'Look Ahead text',
    events: 'Events',
    approve: 'Approve',
    hold: 'Hold',
    edit: 'Edit',
    restore: 'Restore',
    save: 'Save and approve',
    cancel: 'Cancel',
    approveAll: 'Approve all remaining',
    pending: 'Pending',
    approved: 'Approved',
    held: 'Held',
    edited: 'Edited',
    high: 'High stakes',
    low: 'Low stakes',
    legal: 'Legal check',
    sources: 'Sources',
    archived: 'Archived copy',
    noArchive: 'No archived copy yet',
    dead: 'Link no longer works',
    noSources: 'No source attached to this story.',
    removed: 'Removed before publication by your edition rules',
    removedStory: 'The edition rules also changed this story:',
    noEdition: 'Nothing published for this date yet.',
    showroom: 'Showroom page',
    history: 'History',
    noHistory: 'No decisions for this date yet.',
    counts: '{a} approved · {h} held · {n} pending',
    tableMissing: 'Decisions cannot be saved yet: the decisions table is still being set up. Everything can be read; the buttons will work once it is live.',
    langFallback: 'The Italian translation is not ready for this edition, so it is shown in English.',
    needName: 'Type your name at the top first, so the history says who decided.',
    failed: 'Not saved: ',
    editHeader: 'Header',
    editText: 'Text',
    footer1: 'Stakes are classified in code, with no model: crime and courts, deaths and injuries, private individuals, allegations, health claims, money disputes and contested or political claims are high stakes. "Legal check" means the morning desk flags marked the story as sensitive.',
    footer2: 'The source check reads each cited page and looks for the story\'s names, dates and figures on it. Every source page is archived when the story is published; the archived copy opens through a link that expires after two minutes.',
    verdict: {
      verified: 'Check: found on the page',
      partial: 'Check: partly found on the page',
      not_found: 'Check: not found on the page',
      fetch_failed: 'Check: page could not be read',
      no_source: 'Check: no source to read',
      unverifiable_origin: 'Check: link did not come from a search',
    } as Record<string, string>,
    reason: {
      'crime-or-court': 'Crime or court',
      'death-or-injury': 'Death or injury',
      'private-individual': 'Private individual',
      allegation: 'Allegation',
      'health-claim': 'Health claim',
      'money-dispute': 'Money dispute',
      contested: 'Contested',
      'flag-sensitive': 'Flagged sensitive',
      'flag-controversy': 'Controversy',
    } as Record<string, string>,
    actionLabel: { approved: 'approved', held: 'held', edited: 'edited', restored: 'restored' } as Record<string, string>,
  },
  it: {
    judgeLang: 'it' as 'en' | 'it',
    kicker: 'Desk redazionale · Preparato per {p} · Riservato',
    title: 'Desk redazionale: {p}',
    governs: 'Questa pagina decide cosa trasporta il vostro feed; la pagina vetrina resta invariata.',
    how: 'Nulla entra nel vostro feed finché un redattore non lo approva. Gli elementi in attesa o sospesi restano fuori. Una modifica viene salvata con le vostre parole e approva l\'elemento.',
    name: 'Il tuo nome',
    namePh: 'Da inserire una volta, resta su questo dispositivo',
    date: 'Data',
    show: 'Mostra',
    language: 'Lingua',
    dailyBrief: 'Il punto del giorno',
    lookAhead: 'In arrivo',
    headline: 'Titolo',
    laText: 'Testo di In arrivo',
    events: 'Eventi',
    approve: 'Approva',
    hold: 'Sospendi',
    edit: 'Modifica',
    restore: 'Ripristina',
    save: 'Salva e approva',
    cancel: 'Annulla',
    approveAll: 'Approva tutti i rimanenti',
    pending: 'In attesa',
    approved: 'Approvato',
    held: 'Sospeso',
    edited: 'Modificato',
    high: 'Alto rischio',
    low: 'Basso rischio',
    legal: 'Verifica legale',
    sources: 'Fonti',
    archived: 'Copia archiviata',
    noArchive: 'Copia archiviata non ancora disponibile',
    dead: 'Il link non funziona più',
    noSources: 'Nessuna fonte collegata a questa notizia.',
    removed: 'Rimosso prima della pubblicazione dalle vostre regole editoriali',
    removedStory: 'Le regole editoriali hanno modificato anche questa notizia:',
    noEdition: 'Nulla ancora pubblicato per questa data.',
    showroom: 'Pagina vetrina',
    history: 'Cronologia',
    noHistory: 'Nessuna decisione per questa data.',
    counts: '{a} approvati · {h} sospesi · {n} in attesa',
    tableMissing: 'Le decisioni non possono ancora essere salvate: la tabella delle decisioni è in fase di attivazione. Tutto è consultabile; i pulsanti funzioneranno appena sarà attiva.',
    langFallback: 'La traduzione italiana di questa edizione non è ancora pronta, quindi è mostrata in inglese.',
    needName: 'Inserisci prima il tuo nome in alto, così la cronologia indica chi ha deciso.',
    failed: 'Non salvato: ',
    editHeader: 'Titoletto',
    editText: 'Testo',
    footer1: 'Il livello di rischio è classificato dal codice, senza modelli: cronaca giudiziaria, morti e feriti, privati cittadini, accuse, affermazioni sanitarie, controversie economiche e questioni contestate o politiche sono ad alto rischio. "Verifica legale" indica che la notizia è stata segnalata come delicata.',
    footer2: 'La verifica delle fonti legge ogni pagina citata e cerca nomi, date e cifre della notizia. Ogni pagina di fonte viene archiviata alla pubblicazione; la copia archiviata si apre con un link che scade dopo due minuti.',
    verdict: {
      verified: 'Verifica: trovato nella pagina',
      partial: 'Verifica: trovato in parte',
      not_found: 'Verifica: non trovato nella pagina',
      fetch_failed: 'Verifica: pagina non leggibile',
      no_source: 'Verifica: nessuna fonte da leggere',
      unverifiable_origin: 'Verifica: link non proveniente da una ricerca',
    } as Record<string, string>,
    reason: {
      'crime-or-court': 'Cronaca giudiziaria',
      'death-or-injury': 'Morti o feriti',
      'private-individual': 'Privato cittadino',
      allegation: 'Accusa',
      'health-claim': 'Salute',
      'money-dispute': 'Controversia economica',
      contested: 'Questione contestata',
      'flag-sensitive': 'Segnalata come delicata',
      'flag-controversy': 'Polemica',
    } as Record<string, string>,
    actionLabel: { approved: 'approvato', held: 'sospeso', edited: 'modificato', restored: 'ripristinato' } as Record<string, string>,
  },
};
type Strings = typeof STRINGS.en;

function uiStrings(lang: FeedLanguage): Strings {
  return lang === 'it' ? STRINGS.it : STRINGS.en;
}

// ─── Rendering helpers ─────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/** Story text: paragraphs, markdown links as links, **bold**. Everything escaped first. */
function renderText(md: string): string {
  const paras = md.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return paras
    .map((p) => {
      const sub = p.match(/^#{2,3}\s+(.+)$/) || p.match(/^\[\[(.+)\]\]$/);
      if (sub) return `<p class="sub">${esc(sub[1])}</p>`;
      let h = esc(p);
      h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
      h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      return `<p>${h.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
}

function longDate(iso: string, lang: FeedLanguage): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

function timeIn(iso: string, tz: string, lang: FeedLanguage): string {
  return new Date(iso).toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB', {
    timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function currentHeader(it: DeskItem): string {
  return it.state.header ?? it.header;
}
function currentText(it: DeskItem): string {
  return it.state.text ?? it.text;
}

function statusLabel(it: DeskItem, s: Strings): string {
  if (it.state.status === 'approved') return it.state.edited ? `${s.approved} · ${s.edited}` : s.approved;
  return it.state.status === 'held' ? s.held : s.pending;
}

function sourceHtml(src: DeskSource, s: Strings, archiveBase: string): string {
  const name = esc(src.name);
  const link = src.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${name}</a>` : `<span>${name}</span>`;
  const bits: string[] = [link];
  bits.push(
    src.archivePath
      ? `<a class="arch" href="${esc(`${archiveBase}&path=${encodeURIComponent(src.archivePath)}`)}" target="_blank" rel="noopener noreferrer">${s.archived}</a>`
      : `<span class="muted">${s.noArchive}</span>`,
  );
  if (src.dead) bits.push(`<span class="warnc">${s.dead}</span>`);
  if (src.verdict) {
    const cls = src.verdict === 'verified' ? 'ok' : src.verdict === 'partial' ? 'mid' : 'bad';
    const facts = src.factsTotal ? ` (${src.factsFound ?? 0}/${src.factsTotal})` : '';
    bits.push(`<span class="verdict ${cls}">${esc((s.verdict[src.verdict] || src.verdict) + facts)}</span>`);
  }
  if (src.judge) {
    const cls = src.judge.verdict === 'supports' ? 'ok' : src.judge.verdict === 'contradicts' ? 'bad' : 'mid';
    bits.push(`<span class="verdict ${cls}" title="${esc(src.judge.reason || '')}">${esc(judgeLabel(src.judge, s.judgeLang))}</span>`);
  }
  return `<li>${bits.join('<span class="dot">·</span>')}</li>`;
}

function removalList(rs: LoggedRemoval[]): string {
  return `<ul class="removals">${rs.map((r) => `<li><span class="rh">${esc(r.header)}</span> <span class="rule">${esc(r.rule)}</span></li>`).join('')}</ul>`;
}

function itemHtml(it: DeskItem, ed: DeskEdition, s: Strings, archiveBase: string): string {
  const hasHeader = it.kind === 'story' || it.kind === 'event';
  const canEdit = it.kind !== 'event';
  const multiline = it.kind === 'story' || it.kind === 'prose';
  const stakes = it.stakes
    ? `<span class="badge ${it.stakes === 'high' ? 'hi' : 'lo'}">${it.stakes === 'high' ? s.high : s.low}${it.stakes === 'high' && it.stakesReasons.length ? `: ${esc(it.stakesReasons.map((r) => s.reason[r] || r).join(', '))}` : ''}</span>`
    : '';
  const legal = it.legalCheck ? `<span class="badge legal">${s.legal}</span>` : '';
  const kindLabel = it.kind === 'headline' ? s.headline : it.kind === 'prose' ? s.laText : '';
  const sources = it.kind === 'story'
    ? `<div class="srcs"><p class="lab">${s.sources}</p>${it.sources.length ? `<ul>${it.sources.map((x) => sourceHtml(x, s, archiveBase)).join('')}</ul>` : `<p class="muted small">${s.noSources}</p>`}</div>`
    : '';
  const removals = it.removals.length ? `<div class="rem"><p class="lab">${s.removedStory}</p>${removalList(it.removals)}</div>` : '';
  const headerView = hasHeader ? `<h4 class="h">${esc(currentHeader(it))}</h4>` : '';
  const textView = it.kind === 'event'
    ? `<p class="t ev">${esc(currentText(it))}</p>`
    : `<div class="t${it.kind === 'headline' ? ' hl' : ''}">${it.kind === 'headline' ? esc(currentText(it)) : renderText(currentText(it))}</div>`;
  const origHeader = hasHeader ? `<template class="oh">${esc(it.header)}</template>` : '';
  const origText = `<template class="ot">${it.kind === 'headline' || it.kind === 'event' ? esc(it.text) : renderText(it.text)}</template>`;
  const editor = canEdit
    ? `<div class="editor" hidden>
        ${it.kind === 'story' ? `<label>${s.editHeader}<input class="eh" type="text" maxlength="300" value="${esc(currentHeader(it))}"></label>` : ''}
        <label>${it.kind === 'headline' ? s.headline : s.editText}${multiline ? `<textarea class="et" rows="8" maxlength="8000">${esc(currentText(it))}</textarea>` : `<input class="et" type="text" maxlength="300" value="${esc(currentText(it))}">`}</label>
        <textarea class="rawh" hidden>${esc(it.header)}</textarea><textarea class="rawt" hidden>${esc(it.text)}</textarea>
        <div class="acts"><button type="button" class="b primary" data-act="save">${s.save}</button><button type="button" class="b" data-act="cancel">${s.cancel}</button></div>
      </div>`
    : '';
  return `<article class="item k-${it.kind}" data-key="${it.key}" data-article="${it.articleId}" data-hood="${esc(ed.id)}" data-ref="${esc(it.ref)}" data-status="${it.state.status}" data-edited="${it.state.edited ? 1 : 0}" data-label="${esc(it.kind === 'headline' ? `${s.headline}: ${it.text}` : it.kind === 'prose' ? s.laText : it.header)}">
    <div class="top"><span class="status">${statusLabel(it, s)}</span>${kindLabel ? `<span class="kind">${kindLabel}</span>` : ''}${stakes}${legal}</div>
    ${headerView}${textView}${origHeader}${origText}
    ${sources}${removals}${editor}
    <div class="acts main">
      <button type="button" class="b ok" data-act="approved">${s.approve}</button>
      <button type="button" class="b" data-act="held">${s.hold}</button>
      ${canEdit ? `<button type="button" class="b" data-act="edit">${s.edit}</button>` : ''}
      <button type="button" class="b ghost" data-act="restored">${s.restore}</button>
    </div>
  </article>`;
}

function allItems(ed: DeskEdition): DeskItem[] {
  return [
    ...(ed.brief ? [ed.brief.headline, ...ed.brief.stories] : []),
    ...(ed.lookAhead ? [...(ed.lookAhead.prose ? [ed.lookAhead.prose] : []), ...ed.lookAhead.events] : []),
  ];
}

function countsText(items: DeskItem[], s: Strings): string {
  const n = (st: string) => items.filter((i) => i.state.status === st).length;
  return fmt(s.counts, { a: n('approved'), h: n('held'), n: n('pending') });
}

function editionHtml(ed: DeskEdition, day: DeskDay, s: Strings, archiveBase: string): string {
  const items = allItems(ed);
  const fallback = day.lang !== 'en' && ed.language !== day.lang ? `<p class="note">${s.langFallback}</p>` : '';
  const head = `<header class="ed-head">
      <div><h2>${esc(ed.name)}</h2><p class="muted small">${esc(ed.city)} · <a href="${esc(ed.showroomUrl)}" target="_blank" rel="noopener">${s.showroom}</a></p></div>
      <div class="ed-tools"><span class="counts" data-counts>${countsText(items, s)}</span>${items.length ? `<button type="button" class="b primary" data-act="approve-all">${s.approveAll}</button>` : ''}</div>
    </header>`;
  if (!ed.brief && !ed.lookAhead) return `<section class="edition" data-hood="${esc(ed.id)}">${head}<p class="muted">${s.noEdition}</p></section>`;

  const brief = ed.brief
    ? `<div class="block"><h3>${s.dailyBrief}</h3>
        ${itemHtml(ed.brief.headline, ed, s, archiveBase)}
        ${ed.brief.stories.map((it) => itemHtml(it, ed, s, archiveBase)).join('')}
        ${ed.brief.removals.length ? `<details class="cut"><summary>${s.removed} (${ed.brief.removals.length})</summary>${removalList(ed.brief.removals)}</details>` : ''}
      </div>`
    : `<div class="block"><h3>${s.dailyBrief}</h3><p class="muted">${s.noEdition}</p></div>`;

  const la = ed.lookAhead
    ? `<div class="block"><h3>${s.lookAhead}<span class="muted small"> · ${esc(ed.lookAhead.headline)}</span></h3>
        ${ed.lookAhead.prose ? itemHtml(ed.lookAhead.prose, ed, s, archiveBase) : ''}
        ${ed.lookAhead.events.length ? `<p class="lab">${s.events} (${ed.lookAhead.events.length})</p><div class="events">${ed.lookAhead.events.map((it) => itemHtml(it, ed, s, archiveBase)).join('')}</div>` : ''}
        ${ed.lookAhead.sources.length ? `<div class="srcs"><p class="lab">${s.sources}</p><ul>${ed.lookAhead.sources.map((x) => sourceHtml(x, s, archiveBase)).join('')}</ul></div>` : ''}
        ${ed.lookAhead.removals.length ? `<details class="cut"><summary>${s.removed} (${ed.lookAhead.removals.length})</summary>${removalList(ed.lookAhead.removals)}</details>` : ''}
      </div>`
    : '';

  return `<section class="edition" data-hood="${esc(ed.id)}">${head}${fallback}${brief}${la}</section>`;
}

function renderPage(day: DeskDay, key: string, tz: string): string {
  const s = uiStrings(day.lang);
  const g = day.group;
  const base = `/editor/${encodeURIComponent(g.id)}`;
  const archiveBase = `${base}/archive?key=${encodeURIComponent(key)}`;
  const langs: FeedLanguage[] = Array.from(new Set<FeedLanguage>(['en', g.licensee.defaultLang || 'en']));
  const langLinks = langs
    .map((l) => `<a class="lang${l === day.lang ? ' on' : ''}" href="${base}?key=${encodeURIComponent(key)}&date=${day.date}&lang=${l}">${l.toUpperCase()}</a>`)
    .join('');
  const history = day.history.length
    ? `<ol class="hist" data-history>${day.history.map((h) => `<li><time>${esc(timeIn(h.decided_at, tz, day.lang))}</time> <b>${esc(h.decided_by)}</b> ${esc(s.actionLabel[h.action] || h.action)} <span class="muted">${esc(h.edition)}</span> · ${esc(h.label.slice(0, 140))}</li>`).join('')}</ol>`
    : `<ol class="hist" data-history></ol><p class="muted" data-nohistory>${s.noHistory}</p>`;

  const clientStrings = {
    pending: s.pending, approved: s.approved, held: s.held, edited: s.edited,
    needName: s.needName, failed: s.failed, counts: s.counts, actionLabel: s.actionLabel,
  };

  return `<!doctype html>
<html lang="${day.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="referrer" content="no-referrer">
<title>${esc(fmt(s.title, { p: g.publisher }))}</title>
<script>try{var t=localStorage.getItem('flaneur-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Merriweather:wght@400;700&family=Inter:wght@400;500;600&display=swap">
<style>
  :root{
    --canvas:#fafaf9; --surface:#ffffff; --elevated:#f5f5f4; --fg:#1c1917; --muted:#57534e; --subtle:#78716c;
    --border:rgba(0,0,0,.09); --border-strong:rgba(0,0,0,.18); --accent:#8a7a68;
    --ok:#3f6212; --ok-soft:#ecf3e0; --held:#9a3412; --held-soft:#fbeee6; --hi:#9f1239; --hi-soft:#fdebef; --mid:#92400e;
    --serif:"Merriweather",Georgia,"Times New Roman",serif; --display:"Cormorant Garamond",Georgia,serif;
    --sans:"Inter",-apple-system,"Segoe UI",Roboto,sans-serif;
    color-scheme:light;
  }
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
    --canvas:#050505; --surface:#121212; --elevated:#1a1a1a; --fg:#e5e5e5; --muted:#a3a3a3; --subtle:#737373;
    --border:rgba(255,255,255,.09); --border-strong:rgba(255,255,255,.2); --accent:#c9b99a;
    --ok:#a3c77a; --ok-soft:#18200f; --held:#f0a47a; --held-soft:#2a1810; --hi:#f59ab0; --hi-soft:#2a1017; --mid:#f0c36a;
    color-scheme:dark;
  }}
  :root[data-theme="dark"]{
    --canvas:#050505; --surface:#121212; --elevated:#1a1a1a; --fg:#e5e5e5; --muted:#a3a3a3; --subtle:#737373;
    --border:rgba(255,255,255,.09); --border-strong:rgba(255,255,255,.2); --accent:#c9b99a;
    --ok:#a3c77a; --ok-soft:#18200f; --held:#f0a47a; --held-soft:#2a1810; --hi:#f59ab0; --hi-soft:#2a1017; --mid:#f0c36a;
    color-scheme:dark;
  }
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;background:var(--canvas);color:var(--fg);font:15px/1.5 var(--sans);overflow-x:clip}
  a{color:inherit;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px;text-decoration-color:var(--subtle)}
  a:hover{text-decoration-style:solid}
  button,input,textarea{font:inherit;color:inherit}
  .wrap{max-width:820px;margin:0 auto;padding:0 16px calc(56px + env(safe-area-inset-bottom,0px))}
  .mast{padding:32px 0 20px;border-bottom:1px solid var(--border-strong)}
  .kicker{font:500 11px/1.4 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--subtle);margin:0 0 10px}
  h1{font:600 38px/1.05 var(--display);letter-spacing:.01em;margin:0 0 6px}
  .date{font:400 15px/1.4 var(--serif);color:var(--muted);margin:0}
  .governs{margin:16px 0 0;padding:10px 12px;border-left:2px solid var(--accent);background:var(--surface);font-weight:600}
  .how{margin:8px 0 0;color:var(--muted);font-size:14px;max-width:70ch}
  .bar{background:var(--canvas);border-bottom:1px solid var(--border);padding:10px 0;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:end}
  .bar label{display:flex;flex-direction:column;gap:3px;font:500 11px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--subtle)}
  .bar input{font:400 15px/1.3 var(--sans);letter-spacing:0;text-transform:none;color:var(--fg);background:var(--surface);border:1px solid var(--border-strong);border-radius:6px;padding:7px 9px;min-width:0}
  .bar .who input{width:min(260px,70vw)}
  .bar form{display:flex;gap:8px;align-items:end;margin:0}
  .langs{display:flex;gap:4px;align-items:center}
  .lang{font:600 12px/1 var(--sans);letter-spacing:.08em;padding:8px 10px;border:1px solid var(--border-strong);border-radius:999px;text-decoration:none}
  .lang.on{background:var(--fg);color:var(--canvas);border-color:var(--fg)}
  .alert{margin:14px 0 0;padding:10px 12px;border:1px solid var(--held);color:var(--held);background:var(--held-soft);border-radius:6px;font-size:14px}
  .alert[hidden]{display:none}
  .edition{margin-top:34px;padding-top:6px}
  .ed-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:8px 16px;border-bottom:1px solid var(--border-strong);padding-bottom:10px}
  .ed-head h2{font:600 30px/1.1 var(--display);margin:0}
  .ed-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}
  .counts{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
  .block{margin-top:18px}
  .block h3{font:500 11.5px/1.4 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--subtle);margin:0 0 10px}
  .block h3 .small{letter-spacing:0;text-transform:none}
  .item{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--border-strong);border-radius:8px;padding:14px 14px 12px;margin:0 0 10px}
  .item[data-status="approved"]{border-left-color:var(--ok)}
  .item[data-status="held"]{border-left-color:var(--held);opacity:.82}
  .top{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px}
  .status{font:600 10.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;padding:4px 7px;border-radius:4px;background:var(--elevated);color:var(--muted)}
  .item[data-status="approved"] .status{background:var(--ok-soft);color:var(--ok)}
  .item[data-status="held"] .status{background:var(--held-soft);color:var(--held)}
  .kind{font:500 10.5px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--subtle)}
  .badge{font:500 11.5px/1.3 var(--sans);padding:3px 7px;border-radius:4px;border:1px solid var(--border-strong);color:var(--muted)}
  .badge.hi{border-color:var(--hi);color:var(--hi);background:var(--hi-soft)}
  .badge.legal{border-color:var(--hi);background:var(--hi);color:var(--surface)}
  .h{font:700 17px/1.35 var(--serif);margin:4px 0 6px}
  .t{font:400 15.5px/1.65 var(--serif)}
  .t p{margin:0 0 10px}
  .t p.sub{font:600 11.5px/1.4 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--subtle);margin:14px 0 6px}
  .t.hl{font:700 18px/1.35 var(--serif)}
  .t.ev{margin:0;font-size:14px;color:var(--muted)}
  .k-event{padding:10px 12px 8px}
  .k-event .h{font-size:15px;margin:0 0 2px}
  .lab{font:500 11px/1.4 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--subtle);margin:10px 0 4px}
  .srcs ul,.removals{list-style:none;margin:0;padding:0}
  .srcs li{font-size:13.5px;padding:3px 0;display:flex;flex-wrap:wrap;gap:2px 0;align-items:baseline}
  .dot{color:var(--subtle);padding:0 7px}
  .arch{font-weight:500}
  .verdict{font-size:12.5px}
  .verdict.ok{color:var(--ok)} .verdict.mid{color:var(--mid)} .verdict.bad{color:var(--hi)}
  .warnc{color:var(--hi);font-size:12.5px}
  .muted{color:var(--muted)} .small{font-size:13px}
  .rem{margin-top:4px}
  .removals li{font-size:13px;padding:3px 0;color:var(--muted)}
  .removals .rh{color:var(--fg)}
  .rule{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
  details.cut{margin:6px 0 0;font-size:14px}
  details.cut summary{cursor:pointer;color:var(--muted)}
  .acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
  .b{appearance:none;cursor:pointer;border:1px solid var(--border-strong);background:transparent;border-radius:6px;padding:7px 12px;font:500 13.5px/1 var(--sans);min-height:34px}
  .b:hover{background:var(--elevated)}
  .b.ok{border-color:var(--ok);color:var(--ok)}
  .b.primary{background:var(--fg);color:var(--canvas);border-color:var(--fg)}
  .b.ghost{border-color:transparent;color:var(--muted)}
  .b[disabled]{opacity:.5;cursor:wait}
  .item[data-status="approved"] [data-act="approved"],.item[data-status="held"] [data-act="held"],.item[data-status="pending"] [data-act="restored"]{display:none}
  .editor{margin-top:10px;display:grid;gap:8px}
  .editor[hidden]{display:none}
  .editor label{display:grid;gap:4px;font:500 11px/1.4 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--subtle)}
  .editor input,.editor textarea{font:400 15px/1.55 var(--serif);letter-spacing:0;text-transform:none;color:var(--fg);background:var(--canvas);border:1px solid var(--border-strong);border-radius:6px;padding:8px 10px;width:100%}
  .note{margin:10px 0 0;font-size:13.5px;color:var(--mid)}
  .hist{list-style:none;margin:0;padding:0}
  .hist li{font-size:13.5px;padding:6px 0;border-bottom:1px solid var(--border)}
  .hist time{font-variant-numeric:tabular-nums;color:var(--subtle);margin-right:6px}
  h2.sec{font:600 26px/1.1 var(--display);margin:44px 0 10px}
  footer{margin-top:40px;padding-top:14px;border-top:1px solid var(--border-strong);font-size:13px;color:var(--muted)}
  footer p{margin:0 0 8px;max-width:72ch}
  .toast{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--fg);color:var(--canvas);padding:9px 14px;border-radius:8px;font-size:14px;max-width:calc(100vw - 32px);z-index:10}
  .toast[hidden]{display:none}
  @media (min-width:700px){.bar{position:sticky;top:0;z-index:5}}
  @media (max-width:520px){h1{font-size:31px}.ed-head h2{font-size:26px}.t{font-size:15px}}
</style>
</head>
<body>
<div class="wrap">
  <header class="mast">
    <p class="kicker">${esc(fmt(s.kicker, { p: g.publisher }))}</p>
    <h1>${esc(fmt(s.title, { p: g.publisher }))}</h1>
    <p class="date">${esc(longDate(day.date, day.lang))}</p>
    <p class="governs">${s.governs}</p>
    <p class="how">${s.how}</p>
    <p class="alert" data-alert ${day.decisionsError ? '' : 'hidden'}>${day.decisionsError ? s.tableMissing : ''}</p>
  </header>
  <div class="bar">
    <label class="who">${s.name}<input id="who" type="text" maxlength="80" autocomplete="name" placeholder="${esc(s.namePh)}"></label>
    <form method="get" action="${base}">
      <input type="hidden" name="key" value="${esc(key)}">
      <input type="hidden" name="lang" value="${day.lang}">
      <label>${s.date}<input type="date" name="date" value="${day.date}"></label>
      <button class="b" type="submit">${s.show}</button>
    </form>
    <div class="langs" aria-label="${s.language}">${langLinks}</div>
  </div>
  ${day.editions.map((ed) => editionHtml(ed, day, s, archiveBase)).join('')}
  <h2 class="sec">${s.history}</h2>
  ${history}
  <footer>
    <p>${s.footer1}</p>
    <p>${s.footer2}</p>
  </footer>
</div>
<div class="toast" data-toast hidden></div>
<script>
(function(){
  var S=${JSON.stringify(clientStrings).replace(/</g, '\\u003c')};
  var ENDPOINT=${JSON.stringify(`${base}/decide?key=${encodeURIComponent(key)}`)};
  var COOKIE='flaneur-editor-name';
  var who=document.getElementById('who');
  function readCookie(){var m=document.cookie.match(/(?:^|; )flaneur-editor-name=([^;]*)/);return m?decodeURIComponent(m[1]):'';}
  who.value=readCookie();
  who.addEventListener('change',function(){document.cookie=COOKIE+'='+encodeURIComponent(who.value.trim())+'; path=/editor; max-age=31536000; SameSite=Strict';});
  var toastEl=document.querySelector('[data-toast]');var tt;
  function toast(msg){toastEl.textContent=msg;toastEl.hidden=false;clearTimeout(tt);tt=setTimeout(function(){toastEl.hidden=true;},4000);}
  function esc(s){return s.replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function plain(t){return t.split(/\\n\\s*\\n/).map(function(p){return '<p>'+esc(p.trim()).replace(/\\n/g,'<br>')+'</p>';}).join('');}
  function statusText(st,edited){return st==='approved'?(edited?S.approved+' · '+S.edited:S.approved):st==='held'?S.held:S.pending;}
  function counts(section){
    var items=section.querySelectorAll('.item');var a=0,h=0,n=0;
    items.forEach(function(i){var s=i.getAttribute('data-status');if(s==='approved')a++;else if(s==='held')h++;else n++;});
    var el=section.querySelector('[data-counts]');if(el)el.textContent=S.counts.replace('{a}',a).replace('{h}',h).replace('{n}',n);
  }
  function applyResult(r){
    document.querySelectorAll('.item[data-key="'+r.key+'"]').forEach(function(el){
      el.setAttribute('data-status',r.status);el.setAttribute('data-edited',r.edited?'1':'0');
      el.querySelector('.status').textContent=statusText(r.status,r.edited);
      var h=el.querySelector('.h'),t=el.querySelector('.t'),oh=el.querySelector('template.oh'),ot=el.querySelector('template.ot');
      var eh=el.querySelector('.eh'),et=el.querySelector('.et'),rh=el.querySelector('.rawh'),rt=el.querySelector('.rawt');
      if(r.edited){
        if(h&&r.header)h.textContent=r.header;
        if(t&&r.text){t.innerHTML=el.classList.contains('k-headline')?esc(r.text):plain(r.text);}
      } else if(r.status==='pending'){
        if(h&&oh)h.innerHTML=oh.innerHTML; if(t&&ot)t.innerHTML=ot.innerHTML;
        if(eh&&rh)eh.value=rh.value; if(et&&rt)et.value=rt.value;
      }
      var ed=el.querySelector('.editor');if(ed)ed.hidden=true;
      counts(el.closest('.edition'));
    });
  }
  function addHistory(list){
    var ol=document.querySelector('[data-history]');var none=document.querySelector('[data-nohistory]');if(none)none.remove();
    var now=new Date();var tm=now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    list.forEach(function(x){var li=document.createElement('li');li.innerHTML='<time>'+esc(tm)+'</time> <b>'+esc(x.who)+'</b> '+esc(S.actionLabel[x.action]||x.action)+' <span class="muted">'+esc(x.edition)+'</span> · '+esc(x.label.slice(0,140));ol.insertBefore(li,ol.firstChild);});
  }
  function send(decisions,buttons){
    var name=who.value.trim();
    if(!name){toast(S.needName);who.focus();return;}
    document.cookie=COOKIE+'='+encodeURIComponent(name)+'; path=/editor; max-age=31536000; SameSite=Strict';
    buttons.forEach(function(b){b.disabled=true;});
    fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,decisions:decisions.map(function(d){return d.payload;})})})
      .then(function(res){return res.json().then(function(j){return {ok:res.ok,j:j};});})
      .then(function(x){
        if(!x.ok||!x.j.ok){var msg=(x.j&&x.j.error)||'error';toast(S.failed+msg);var al=document.querySelector('[data-alert]');if(x.j&&/table/.test(msg)){al.textContent=msg;al.hidden=false;}return;}
        x.j.results.forEach(applyResult);
        addHistory(decisions.map(function(d){return {who:name,action:d.payload.action,edition:d.edition,label:d.label};}));
      })
      .catch(function(){toast(S.failed+'network');})
      .finally(function(){buttons.forEach(function(b){b.disabled=false;});});
  }
  function payload(el,action,header,text){
    return {payload:{neighborhoodId:el.getAttribute('data-hood'),articleId:el.getAttribute('data-article'),ref:el.getAttribute('data-ref'),action:action,header:header||null,text:text||null},
      edition:(el.closest('.edition').querySelector('h2')||{}).textContent||'',label:el.getAttribute('data-label')||''};
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-act]');if(!b)return;
    var act=b.getAttribute('data-act');
    if(act==='approve-all'){
      var sec=b.closest('.edition');var ds=[];
      sec.querySelectorAll('.item[data-status="pending"]').forEach(function(el){ds.push(payload(el,'approved'));});
      if(ds.length)send(ds,[b]);return;
    }
    var el=b.closest('.item');if(!el)return;
    var ed=el.querySelector('.editor');
    if(act==='edit'){if(ed){ed.hidden=false;var f=ed.querySelector('input,textarea');if(f)f.focus();}return;}
    if(act==='cancel'){if(ed)ed.hidden=true;return;}
    if(act==='save'){
      var eh=el.querySelector('.eh'),et=el.querySelector('.et');
      send([payload(el,'edited',eh?eh.value.trim():null,et?et.value.trim():null)],[b]);return;
    }
    send([payload(el,act)],[b]);
  });
})();
</script>
</body>
</html>`;
}

// ─── Handler ───────────────────────────────────────────────────────────────

export async function GET(request: Request, { params }: { params: Promise<{ group: string }> }) {
  const { group: groupId } = await params;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  const group = getEditorGroup(groupId);
  if (!group || !checkEditorKey(groupId, key)) return notFound();

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // The group's local "today": its editions share one timezone (GEDI: Europe/Rome).
  const { data: first } = await admin.from('neighborhoods').select('timezone').eq('id', group.licensee.editions[0]).maybeSingle();
  const tz = (first?.timezone as string) || 'UTC';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const dateParam = url.searchParams.get('date') || '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam <= today ? dateParam : today;
  const langParam = url.searchParams.get('lang');
  const lang: FeedLanguage = isFeedLanguage(langParam) ? langParam : group.licensee.defaultLang || 'en';

  const day = await loadDeskDay(admin, group, date, lang);
  return new Response(renderPage(day, key, tz), {
    headers: { ...PRIVATE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
