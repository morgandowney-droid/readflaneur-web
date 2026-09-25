import { createClient } from '@supabase/supabase-js';
import { checkEditorKey, getEditorGroup, notFound, PRIVATE_HEADERS } from '@/lib/editor-desk';
import {
  cleanEditorName,
  foldDecisions,
  parseDecisionInput,
  stateFor,
  storyKey,
  type DecisionInput,
  type DecisionRow,
} from '@/lib/editorial-decisions';

/**
 * Record editorial decisions from the editor desk (/editor/[group]).
 *
 * POST JSON { name, decisions: [{ neighborhoodId, articleId, ref, action, header?, text? }] }
 * with the same ?key= as the page. Appends one row per decision to
 * editorial_decisions (the table is its own audit trail) and returns each
 * item's new state. Keys are computed here from the article id and item ref,
 * never taken from the client, and every article must belong to the edition
 * and be of the kind the ref names.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BATCH = 200;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ group: string }> }) {
  const { group: groupId } = await params;
  const url = new URL(request.url);
  const group = getEditorGroup(groupId);
  if (!group || !checkEditorKey(groupId, url.searchParams.get('key'))) return notFound();

  let body: { name?: unknown; decisions?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected JSON.' }, 400);
  }
  const name = cleanEditorName(body.name);
  if (!name) return json({ error: 'Type your name first, so the history says who decided.' }, 400);
  const raw = Array.isArray(body.decisions) ? body.decisions : [];
  if (!raw.length || raw.length > MAX_BATCH) return json({ error: `Send between 1 and ${MAX_BATCH} decisions.` }, 400);

  const inputs: DecisionInput[] = [];
  for (const r of raw) {
    const parsed = parseDecisionInput(r, group.licensee.editions);
    if (typeof parsed === 'string') return json({ error: parsed }, 400);
    inputs.push(parsed);
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // Every article must be published, in the named edition, and of the kind the ref names.
  const articleIds = Array.from(new Set(inputs.map((d) => d.articleId)));
  const { data: arts, error: artErr } = await admin
    .from('articles')
    .select('id, neighborhood_id, article_type')
    .in('id', articleIds)
    .eq('status', 'published');
  if (artErr) return json({ error: 'Could not check the articles. Try again.' }, 500);
  for (const d of inputs) {
    const a = arts?.find((x) => x.id === d.articleId);
    if (!a || a.neighborhood_id !== d.neighborhoodId) return json({ error: 'That item is not in this edition.' }, 400);
    const briefRef = d.ref === 'headline' || /^\d+$/.test(d.ref);
    if (a.article_type === 'brief_summary' ? !briefRef : a.article_type === 'look_ahead' ? briefRef : true) {
      return json({ error: 'That item does not match its article.' }, 400);
    }
  }

  const now = Date.now();
  const rows = inputs.map((d, i) => ({
    group_id: group.id,
    neighborhood_id: d.neighborhoodId,
    article_id: d.articleId,
    story_key: storyKey(d.articleId, d.ref),
    item_ref: d.ref,
    action: d.action,
    edited_header: d.header,
    edited_text: d.text,
    decided_by: name,
    // Distinct timestamps keep a batch's order stable when folded.
    decided_at: new Date(now + i).toISOString(),
  }));
  const { error: insErr } = await admin.from('editorial_decisions').insert(rows);
  if (insErr) {
    const missing = /does not exist|schema cache|42P01|PGRST205/i.test(`${insErr.code} ${insErr.message}`);
    return json(
      {
        error: missing
          ? 'Decisions cannot be saved yet: the editorial_decisions table has not been created.'
          : 'The decision was not saved. Try again.',
      },
      missing ? 503 : 500,
    );
  }

  const keys = Array.from(new Set(rows.map((r) => r.story_key)));
  const { data: after } = await admin
    .from('editorial_decisions')
    .select('story_key, article_id, action, edited_header, edited_text, decided_by, decided_at')
    .eq('group_id', group.id)
    .in('story_key', keys)
    .order('decided_at', { ascending: true });
  const states = foldDecisions((after || []) as DecisionRow[]);
  return json({
    ok: true,
    results: keys.map((k) => ({ key: k, ...stateFor(states, k) })),
  });
}
