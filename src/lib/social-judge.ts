/**
 * Llama as the judge for Facebook, Instagram, Threads and TikTok sources.
 *
 * X posts are found and read by Grok. A story whose source is a post on one of
 * Meta's platforms or on TikTok gets a second look from a Meta open-weight
 * model: we fetch what the post shows publicly (caption, og and meta
 * description, JSON-LD; for TikTok the public oEmbed record; the archived
 * snapshot when the live page cannot be read), and Llama says whether that
 * text supports, contradicts or has nothing to do with the story's facts.
 *
 * The model never finds or supplies a source or a URL: it judges only text we
 * fetched. When there is too little text to judge, no model is called and the
 * verdict is `unreadable`.
 *
 * Called from the shadow-source-checks cron (pilot editions). Never throws.
 */
import { AI_MODELS } from '@/config/ai-models';
import { recordAiUsage } from '@/lib/ai-cost';
import { extractFacts, type PageText } from '@/lib/source-check';
import {
  buildJudgePrompt,
  extractPostText,
  parseJudgement,
  readable,
  socialPlatform,
  type JudgeVerdict,
  type SocialPlatform,
} from '@/lib/social-judge-core';

export { socialPlatform } from '@/lib/social-judge-core';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const LLAMA_JUDGE_MODEL = process.env.LLAMA_JUDGE_MODEL?.trim() || AI_MODELS.LLAMA_JUDGE;

export interface SocialJudgement {
  judge: 'llama';
  model: string;
  platform: SocialPlatform;
  verdict: JudgeVerdict;
  factsTotal: number;
  supportedFacts: Array<{ kind: string; text: string }>;
  contradictedFacts: Array<{ kind: string; text: string }>;
  reason: string | null;
  /** Where the text came from: live page fields, 'tiktok-oembed' or 'snapshot'. */
  textFrom: string[];
  /** False when no model was called (nothing readable, or no API key). */
  modelCalled: boolean;
  error?: string;
}

async function tiktokOembed(url: string): Promise<string> {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return '';
    const j = (await res.json()) as { title?: string; author_name?: string };
    return [j.author_name ? `@${j.author_name}` : '', j.title || ''].filter(Boolean).join('\n');
  } catch {
    return '';
  }
}

/**
 * Judge one social source for one story. `page` is the live fetch the caller
 * already made; `snapshotHtml` an archived copy, used when the live page has
 * nothing readable. Returns null for a URL that is not a Meta or TikTok post.
 */
export async function judgeSocialSource(args: {
  url: string;
  story: { entity?: string | null; context?: string | null };
  page?: PageText | null;
  snapshotHtml?: string | null;
  placeNames?: string[];
  label?: string;
}): Promise<SocialJudgement | null> {
  const platform = socialPlatform(args.url);
  if (!platform) return null;

  const allFacts = extractFacts(args.story, args.placeNames || []).map((f) => ({ kind: f.kind, text: f.text }));
  const base: SocialJudgement = {
    judge: 'llama', model: LLAMA_JUDGE_MODEL, platform, verdict: 'unreadable', factsTotal: allFacts.length,
    supportedFacts: [], contradictedFacts: [], reason: null, textFrom: [], modelCalled: false,
  };

  // What the post says publicly.
  let post = extractPostText(args.page?.ok ? args.page.html : null);
  let textFrom = post.fields;
  if (!post.text && platform === 'tiktok') {
    const t = await tiktokOembed(args.url);
    if (readable(t)) { post = { text: t, fields: ['tiktok-oembed'] }; textFrom = post.fields; }
  }
  if (!post.text && args.snapshotHtml) {
    const s = extractPostText(args.snapshotHtml);
    if (s.text) { post = s; textFrom = s.fields.map((f) => `snapshot:${f}`); }
  }
  if (!post.text) return { ...base, reason: 'No public text on the post page (login wall or empty).' };

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return { ...base, textFrom, error: 'OPENROUTER_API_KEY not set' };

  const prompt = buildJudgePrompt({
    platform,
    entity: (args.story.entity || '').trim(),
    context: (args.story.context || '').trim(),
    facts: allFacts,
    postText: post.text,
  });

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://readflaneur.com',
        'X-Title': 'Flaneur',
      },
      body: JSON.stringify({
        model: LLAMA_JUDGE_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return { ...base, textFrom, error: `OpenRouter HTTP ${res.status}` };
    const data = await res.json();
    const usage = data?.usage || {};
    recordAiUsage({
      provider: 'meta',
      model: LLAMA_JUDGE_MODEL,
      operation: 'judge_social_source',
      kind: 'generation',
      label: args.label || null,
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      metadata: { platform, via: 'openrouter' },
      providerCostUsd: typeof usage.cost === 'number' ? usage.cost : null,
    });
    const raw: string = data?.choices?.[0]?.message?.content || '';
    const parsed = parseJudgement(raw, Math.max(allFacts.length, 0));
    if (!parsed) return { ...base, textFrom, modelCalled: true, error: 'unparseable verdict' };
    return {
      ...base,
      textFrom,
      modelCalled: true,
      verdict: parsed.verdict,
      supportedFacts: parsed.supportedFacts.map((n) => allFacts[n - 1]),
      contradictedFacts: parsed.contradictedFacts.map((n) => allFacts[n - 1]),
      reason: parsed.reason,
    };
  } catch (err) {
    return { ...base, textFrom, error: err instanceof Error ? err.message : String(err) };
  }
}
