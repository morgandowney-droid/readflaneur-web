import { NextRequest, NextResponse } from 'next/server';
import { synthesize } from '@/lib/edition-audio';
import { azureLocale } from '@/lib/voice-options';

/**
 * Private helper for comparing text-to-speech voices by ear (29 Sep 2026:
 * Azure standard vs Multilingual vs HD for the GEDI editions, and ElevenLabs
 * Multilingual v2 vs Eleven v4 for the yous.news bulletin). The ElevenLabs key
 * lives only in Vercel, so rendering has to happen here.
 *
 *   GET  ?op=models             ElevenLabs models (id, name, whether Italian)
 *   GET  ?op=voices             ElevenLabs voices (id, name, labels)
 *   POST {text, model_id, voice_id}  audio/mpeg
 *   POST ?provider=azure {text, voice, lang?, rate?}  audio/mpeg (Azure voice)
 *
 * Bearer CRON_SECRET only. Publishes nothing and stores nothing.
 */

export const runtime = 'nodejs';
export const maxDuration = 120;

const API = 'https://api.elevenlabs.io/v1';

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`;
}

function key(): string | null {
  return process.env.ELEVENLABS_API_KEY?.trim() || null;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const k = key();
  if (!k) return NextResponse.json({ error: 'ELEVENLABS_API_KEY not set' }, { status: 500 });
  const op = req.nextUrl.searchParams.get('op');
  if (op === 'models') {
    const r = await fetch(`${API}/models`, { headers: { 'xi-api-key': k } });
    const data = await r.json();
    if (!Array.isArray(data)) return NextResponse.json({ status: r.status, data }, { status: r.status });
    return NextResponse.json(data.map((m: { model_id: string; name: string; languages?: Array<{ name: string }> }) => ({
      model_id: m.model_id, name: m.name, languages: (m.languages || []).length,
      italian: (m.languages || []).some((l) => /ital/i.test(l.name)),
    })));
  }
  if (op === 'voices') {
    const r = await fetch(`${API}/voices`, { headers: { 'xi-api-key': k } });
    const data = await r.json();
    const voices = (data?.voices || []) as Array<{ voice_id: string; name: string; labels?: Record<string, string>; category?: string }>;
    return NextResponse.json(voices.map((v) => ({ voice_id: v.voice_id, name: v.name, category: v.category, labels: v.labels })));
  }
  if (op === 'shared') {
    // The shared Voice Library, e.g. ?op=shared&language=it&gender=female&use_case=news
    const qs = new URLSearchParams({ page_size: '30' });
    for (const p of ['language', 'gender', 'use_case', 'accent', 'search', 'age']) {
      const v = req.nextUrl.searchParams.get(p);
      if (v) qs.set(p, v);
    }
    const r = await fetch(`${API}/shared-voices?${qs}`, { headers: { 'xi-api-key': k } });
    const data = await r.json();
    const voices = (data?.voices || []) as Array<Record<string, unknown>>;
    if (!r.ok) return NextResponse.json({ status: r.status, data }, { status: r.status });
    return NextResponse.json(voices.map((v) => ({
      voice_id: v.voice_id, public_owner_id: v.public_owner_id, name: v.name, gender: v.gender, age: v.age,
      accent: v.accent, language: v.language, locale: v.locale, use_case: v.use_case, descriptive: v.descriptive,
      usage_character_count_1y: v.usage_character_count_1y, cloned_by_count: v.cloned_by_count, free_users_allowed: v.free_users_allowed,
    })));
  }
  if (op === 'add') {
    // Add a shared library voice to this account so the API can speak with it.
    const owner = req.nextUrl.searchParams.get('owner');
    const id = req.nextUrl.searchParams.get('id');
    const name = req.nextUrl.searchParams.get('name') || id || 'voice';
    if (!owner || !id) return NextResponse.json({ error: 'owner and id required' }, { status: 400 });
    const r = await fetch(`${API}/voices/add/${encodeURIComponent(owner)}/${encodeURIComponent(id)}`, {
      method: 'POST', headers: { 'xi-api-key': k, 'Content-Type': 'application/json' }, body: JSON.stringify({ new_name: name }),
    });
    return NextResponse.json({ status: r.status, data: await r.json().catch(() => null) }, { status: r.ok ? 200 : r.status });
  }
  return NextResponse.json({ error: 'op must be models, voices, shared or add' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (req.nextUrl.searchParams.get('provider') === 'azure') {
    // Azure: {text, voice, lang?, rate?}. The Azure key also lives only in Vercel.
    const b = await req.json().catch(() => null) as { text?: string; voice?: string; lang?: string; rate?: string } | null;
    if (!b?.text || !b.voice) return NextResponse.json({ error: 'text and voice required' }, { status: 400 });
    if (b.text.length > 5000) return NextResponse.json({ error: 'text too long' }, { status: 400 });
    try {
      const tts = await synthesize(b.text, { voice: b.voice, lang: b.lang || azureLocale(b.voice, 'en'), rate: b.rate || '+0%' });
      return new NextResponse(new Uint8Array(tts.audio), { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }
  const k = key();
  if (!k) return NextResponse.json({ error: 'ELEVENLABS_API_KEY not set' }, { status: 500 });
  const body = await req.json().catch(() => null) as { text?: string; model_id?: string; voice_id?: string } | null;
  if (!body?.text || !body.model_id || !body.voice_id) return NextResponse.json({ error: 'text, model_id and voice_id required' }, { status: 400 });
  if (body.text.length > 5000) return NextResponse.json({ error: 'text too long' }, { status: 400 });
  const r = await fetch(`${API}/text-to-speech/${encodeURIComponent(body.voice_id)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': k, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: body.text, model_id: body.model_id }),
  });
  if (!r.ok) return NextResponse.json({ status: r.status, error: (await r.text()).slice(0, 500) }, { status: 502 });
  return new NextResponse(Buffer.from(await r.arrayBuffer()), { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
}
