import { createClient } from '@supabase/supabase-js';
import { checkEditorKey, getEditorGroup, notFound, PRIVATE_HEADERS } from '@/lib/editor-desk';
import { VOICE_CHOICE_TABLE } from '@/lib/edition-audio';
import { cleanEditorName } from '@/lib/editorial-decisions';
import { optionFor } from '@/lib/voice-options';

/**
 * Save the publisher's voice choice from /editor/[group]/voices.
 *
 * POST JSON { edition, label, name? } with the page's ?key=. The editor's name
 * comes from the desk cookie (flaneur-editor-name), or the body when the
 * cookie is not set yet; one of them is required, as on the desk. The edition
 * must belong to the group and the label must be an option for the group's
 * language. Upserts edition_voice_choice with the option it resolves to, for
 * the record. The response never names a provider or voice.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function cookieName(request: Request): string | null {
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)flaneur-editor-name=([^;]*)/);
  if (!m) return null;
  try {
    return cleanEditorName(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ group: string }> }) {
  const { group: groupId } = await params;
  const url = new URL(request.url);
  const group = getEditorGroup(groupId);
  if (!group || !checkEditorKey(groupId, url.searchParams.get('key'))) return notFound();

  let body: { edition?: unknown; label?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected JSON.' }, 400);
  }
  const it = group.licensee.defaultLang === 'it';
  const name = cookieName(request) || cleanEditorName(body.name);
  if (!name) return json({ error: it ? 'Inserisci prima il tuo nome.' : 'Type your name first.' }, 400);
  const edition = typeof body.edition === 'string' ? body.edition : '';
  if (!group.licensee.editions.includes(edition)) return json({ error: it ? 'Quartiere non valido.' : 'That area is not in this group.' }, 400);
  const language = group.licensee.defaultLang || 'en';
  const option = optionFor(language, body.label);
  if (!option) return json({ error: it ? 'Voce non valida.' : 'That voice is not one of A to E.' }, 400);

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const row = {
    neighborhood_id: edition,
    label: option.label,
    language,
    provider: option.provider,
    voice: option.voice,
    model: option.model || null,
    chosen_by: name,
    chosen_at: new Date().toISOString(),
  };
  const { error } = await admin.from(VOICE_CHOICE_TABLE).upsert(row, { onConflict: 'neighborhood_id' });
  if (error) {
    const missing = /does not exist|schema cache|42P01|PGRST205/i.test(`${error.code} ${error.message}`);
    return json(
      { error: missing ? (it ? 'La funzione è ancora in fase di attivazione.' : 'This is still being set up.') : (it ? 'Non salvato. Riprova.' : 'Not saved. Try again.') },
      missing ? 503 : 500,
    );
  }
  return json({ ok: true, edition, label: option.label, chosen_by: name, chosen_at: row.chosen_at });
}
