/**
 * Editorial decisions: what a licensee's editor approved, held or rewrote.
 *
 * GEDI said on 25 Sep 2026 that a human must check anything before it runs
 * under their logo, and asked for an interface where editors can select,
 * change and push the feed. The editor desk at /editor/[group] writes one row
 * per action to `editorial_decisions`; the licensee feed (/api/v1) reads them
 * and, for a licensee with `requireApproval`, carries only what an editor
 * approved, with the editor's wording.
 *
 * The table is append-only, so it is also the audit trail. The state of an
 * item is the fold of its rows in time order:
 *   approved  -> approved (an earlier edit stays)
 *   edited    -> approved, with the edited header and text
 *   held      -> held (an earlier edit stays, for when it is approved again)
 *   restored  -> back to pending with the original text
 *
 * Items are keyed per published article: each [[section]] story of a Daily
 * Brief, the brief's headline, the Look Ahead prose and each Look Ahead event.
 * A story's key is the same id the feed already returns for it (storyId in
 * licensee-feed.ts), so a decision and a feed item name each other.
 *
 * Pure apart from node:crypto, so scripts/test-editorial-decisions.mjs can
 * compile and test it without the app.
 */
import { createHash } from 'node:crypto';

export type DecisionAction = 'approved' | 'held' | 'edited' | 'restored';
export const DECISION_ACTIONS: readonly DecisionAction[] = ['approved', 'held', 'edited', 'restored'];

export type ItemStatus = 'pending' | 'approved' | 'held';

/**
 * What a key names inside an article:
 *   '3'        the story at position 3 (the fourth [[section]])
 *   'headline' the Daily Brief headline
 *   'prose'    the Look Ahead prose
 *   'event:2'  the third Look Ahead event
 */
export type ItemRef = string;
const REF_PATTERN = /^(\d{1,3}|headline|prose|event:\d{1,3})$/;

export function isValidRef(ref: unknown): ref is ItemRef {
  return typeof ref === 'string' && REF_PATTERN.test(ref);
}

/**
 * Stable key for one item of one article. For a story (a numeric ref) this is
 * exactly the feed's story id: sha256(`${articleId}:${index}`), first 24 hex.
 */
export function storyKey(articleId: string, ref: ItemRef | number): string {
  return createHash('sha256').update(`${articleId}:${ref}`).digest('hex').slice(0, 24);
}

export interface DecisionRow {
  story_key: string;
  article_id: string;
  action: DecisionAction;
  edited_header?: string | null;
  edited_text?: string | null;
  decided_by: string;
  decided_at: string;
}

export interface ItemState {
  status: ItemStatus;
  /** The editor's header, when they rewrote it. */
  header: string | null;
  /** The editor's text, when they rewrote it. */
  text: string | null;
  edited: boolean;
  decided_by: string | null;
  decided_at: string | null;
}

export const PENDING: ItemState = Object.freeze({
  status: 'pending',
  header: null,
  text: null,
  edited: false,
  decided_by: null,
  decided_at: null,
}) as ItemState;

/** Latest state per story_key, folding each key's rows in time order. */
export function foldDecisions(rows: DecisionRow[]): Map<string, ItemState> {
  const sorted = [...rows].sort((a, b) => Date.parse(a.decided_at) - Date.parse(b.decided_at));
  const out = new Map<string, ItemState>();
  for (const r of sorted) {
    const prev = out.get(r.story_key) || PENDING;
    const who = { decided_by: r.decided_by, decided_at: r.decided_at };
    switch (r.action) {
      case 'approved':
        out.set(r.story_key, { ...prev, status: 'approved', ...who });
        break;
      case 'held':
        out.set(r.story_key, { ...prev, status: 'held', ...who });
        break;
      case 'edited': {
        const header = r.edited_header?.trim() || null;
        const text = r.edited_text?.trim() || null;
        out.set(r.story_key, {
          status: 'approved',
          header: header ?? prev.header,
          text: text ?? prev.text,
          edited: Boolean(header || text || prev.edited),
          ...who,
        });
        break;
      }
      case 'restored':
        out.set(r.story_key, { ...PENDING, ...who });
        break;
    }
  }
  return out;
}

export function stateFor(states: Map<string, ItemState>, key: string): ItemState {
  return states.get(key) || PENDING;
}

// ─── Applying decisions to feed content ────────────────────────────────────

export interface EditorialStatus {
  status: ItemStatus;
  edited: boolean;
  decided_by: string | null;
  decided_at: string | null;
}

function statusOf(s: ItemState): EditorialStatus {
  return { status: s.status, edited: s.edited, decided_by: s.decided_by, decided_at: s.decided_at };
}

export interface StoryLike {
  id: string;
  header: string;
  text: string;
}

export interface Withheld {
  pending: number;
  held: number;
}

/**
 * Apply decisions to a list of stories.
 *
 * Without requireApproval the stories come back unchanged: the licensee
 * publishes as before and decisions do nothing. With it, only approved
 * stories come back, carrying the editor's header and text where they
 * rewrote them and their editorial status; the rest are counted.
 */
export function applyDecisionsToStories<T extends StoryLike>(
  stories: T[],
  states: Map<string, ItemState>,
  requireApproval: boolean,
): { stories: Array<T & { editorial?: EditorialStatus }>; withheld: Withheld } {
  const withheld: Withheld = { pending: 0, held: 0 };
  if (!requireApproval) return { stories, withheld };
  const out: Array<T & { editorial: EditorialStatus }> = [];
  for (const s of stories) {
    const st = stateFor(states, s.id);
    if (st.status !== 'approved') {
      withheld[st.status]++;
      continue;
    }
    out.push({ ...s, header: st.header ?? s.header, text: st.text ?? s.text, editorial: statusOf(st) });
  }
  return { stories: out, withheld };
}

/** One item (a headline, the Look Ahead prose): its approved value, or null. */
export function approvedValue(
  value: string,
  state: ItemState,
  requireApproval: boolean,
): { value: string | null; editorial?: EditorialStatus } {
  if (!requireApproval) return { value };
  if (state.status !== 'approved') return { value: null, editorial: statusOf(state) };
  return { value: state.text ?? value, editorial: statusOf(state) };
}

/** Look Ahead events an editor approved, by position. */
export function approvedEvents<E>(
  events: E[],
  articleId: string,
  states: Map<string, ItemState>,
  requireApproval: boolean,
): { events: E[]; withheld: Withheld } {
  const withheld: Withheld = { pending: 0, held: 0 };
  if (!requireApproval) return { events, withheld };
  const out: E[] = [];
  events.forEach((e, i) => {
    const st = stateFor(states, storyKey(articleId, `event:${i}`));
    if (st.status === 'approved') out.push(e);
    else withheld[st.status]++;
  });
  return { events: out, withheld };
}

/** Markdown body from the stories that remain, in the feed's `## Header` form. */
export function rebuildMarkdown(
  greeting: string | null,
  stories: Array<{ header: string; text: string }>,
  signOff: string | null,
): string {
  const parts: string[] = [];
  if (greeting && stories.length) parts.push(greeting.trim());
  for (const s of stories) parts.push(`## ${s.header.trim()}\n\n${s.text.trim()}`);
  if (signOff && stories.length) parts.push(signOff.trim());
  return parts.join('\n\n').trim();
}

// ─── Input from the editor page ────────────────────────────────────────────

export const MAX_HEADER = 300;
export const MAX_TEXT = 8000;
export const MAX_NAME = 80;

export interface DecisionInput {
  neighborhoodId: string;
  articleId: string;
  ref: ItemRef;
  action: DecisionAction;
  header: string | null;
  text: string | null;
}

/** Validate one posted decision. Returns an error message or the clean input. */
export function parseDecisionInput(raw: unknown, allowedEditions: readonly string[]): DecisionInput | string {
  const r = (raw || {}) as Record<string, unknown>;
  const neighborhoodId = typeof r.neighborhoodId === 'string' ? r.neighborhoodId : '';
  const articleId = typeof r.articleId === 'string' ? r.articleId : '';
  if (!allowedEditions.includes(neighborhoodId)) return 'unknown edition';
  if (!/^[0-9a-f-]{36}$/i.test(articleId)) return 'bad article id';
  if (!isValidRef(r.ref)) return 'bad item';
  if (!(DECISION_ACTIONS as readonly string[]).includes(r.action as string)) return 'bad action';
  const action = r.action as DecisionAction;
  const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
  const header = action === 'edited' ? clip(r.header, MAX_HEADER) : null;
  const text = action === 'edited' ? clip(r.text, MAX_TEXT) : null;
  if (action === 'edited' && !header && !text) return 'an edit needs a header or text';
  return { neighborhoodId, articleId, ref: r.ref, action, header, text };
}

export function cleanEditorName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u001f]/g, '').trim().slice(0, MAX_NAME);
  return s || null;
}

// ─── Removals logged at publication ────────────────────────────────────────

export interface LoggedRemoval {
  header: string;
  rule: string;
}

/**
 * Read the edition-rules removals out of articles.editor_notes (written by
 * formatRemovals in edition-rules.ts: one `- "<header>": <rule>` line each).
 */
export function parseRemovals(editorNotes: string | null | undefined): LoggedRemoval[] {
  if (!editorNotes || !/Edition rules \(/.test(editorNotes)) return [];
  const out: LoggedRemoval[] = [];
  for (const line of editorNotes.split('\n')) {
    const m = line.match(/^- "(.*)": (.+)$/);
    if (m) out.push({ header: m[1], rule: m[2].trim() });
  }
  return out;
}
