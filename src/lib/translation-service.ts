import { GoogleGenAI } from '@google/genai';
import { AI_MODELS } from '@/config/ai-models';
import { recordGeminiCall, recordAiUsage } from '@/lib/ai-cost';
import type { SupabaseClient } from '@supabase/supabase-js';

export type LanguageCode = 'sv' | 'fr' | 'de' | 'es' | 'pt' | 'it' | 'zh' | 'ja';

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  sv: 'Swedish',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
  it: 'Italian',
  zh: 'Simplified Chinese',
  ja: 'Japanese',
};

const RETRY_DELAYS = [2000, 5000, 15000];

// Translation runs on Qwen (open-weight, ~6x cheaper than Gemini Flash on
// output, and strong at multilingual). Routed via OpenRouter's OpenAI-compatible
// API. Falls back to Gemini Flash if OPENROUTER_API_KEY is unset or Qwen fails.
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Swap freely - see openrouter.ai/models. Override with the QWEN_MODEL env var.
const QWEN_MODEL = process.env.QWEN_MODEL?.trim() || 'qwen/qwen-2.5-72b-instruct';

interface ArticleTranslation {
  headline: string;
  body: string;
  preview_text: string | null;
}

interface BriefTranslation {
  content: string;
  enriched_content: string | null;
}

/** Translate article fields. Returns null on failure. */
export async function translateArticle(
  headline: string,
  body: string,
  previewText: string | null,
  targetLang: LanguageCode
): Promise<ArticleTranslation | null> {
  // Extract [[Event Listing]]...--- block before translation.
  // Event listings contain structured data (times, venues, addresses, semicolons)
  // that must stay in English for isEventLine() parsing and EventListingBlock rendering.
  const eventListingRegex = /^\[\[Event Listing\]\]\s*[\s\S]*?\n---\s*\n/;
  const eventMatch = body.match(eventListingRegex);
  const eventListingBlock = eventMatch ? eventMatch[0] : null;
  const bodyToTranslate = eventListingBlock ? body.substring(eventListingBlock.length) : body;

  const langName = LANGUAGE_NAMES[targetLang];
  const prompt = `Translate the following newspaper article from English to ${langName}.

Rules:
1. PRESERVE all local language words/phrases from the original (e.g., "God morgon", "Marais", "izakaya", "Stammtisch"). These are deliberately left in the original language by the author.
2. PRESERVE all proper nouns exactly as written: neighborhood names, venue names, street names, people's names.
3. PRESERVE all [[section headers]] and **bold markers** exactly as they appear (translate the text inside them).
4. Maintain the editorial/literary tone - this is a premium neighborhood newsletter, not a machine translation.
5. Adapt idioms naturally rather than translating literally.

Return ONLY valid JSON (no markdown fences):
{"headline": "...", "body": "...", "preview_text": ${previewText ? '"..."' : 'null'}}

HEADLINE:
${headline}

BODY:
${bodyToTranslate}
${previewText ? `\nPREVIEW TEXT:\n${previewText}` : ''}`;

  const result = await translateJson<ArticleTranslation>(prompt, 'translate_article', targetLang);

  // Recombine: prepend the original English event listing to the translated body
  if (result && eventListingBlock) {
    result.body = eventListingBlock + result.body;
  }

  return result;
}

/** Translate brief content. Returns null on failure. */
export async function translateBrief(
  content: string,
  enrichedContent: string | null,
  targetLang: LanguageCode
): Promise<BriefTranslation | null> {
  const langName = LANGUAGE_NAMES[targetLang];
  const prompt = `Translate the following daily neighborhood brief from English to ${langName}.

Rules:
1. PRESERVE all local language words/phrases from the original (e.g., "God morgon", greetings in the local language, venue names in the local language). These are deliberately included by the author.
2. PRESERVE all proper nouns exactly as written: neighborhood names, venue names, street names, people's names.
3. PRESERVE all [[section headers]] and **bold markers** exactly as they appear (translate the text inside them).
4. Maintain the editorial/literary tone - warm, informed, like a knowledgeable neighbor.
5. Adapt idioms naturally rather than translating literally.

Return ONLY valid JSON (no markdown fences):
{"content": "...", "enriched_content": ${enrichedContent ? '"..."' : 'null'}}

CONTENT:
${content}
${enrichedContent ? `\nENRICHED CONTENT:\n${enrichedContent}` : ''}`;

  return translateJson<BriefTranslation>(prompt, 'translate_brief', targetLang);
}

/** Parse a JSON object out of a model response, tolerating code fences and prose. */
function parseJsonLoose<T>(text: string): T | null {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        // fall through
      }
    }
  }
  return null;
}

/**
 * Translate via Qwen (OpenRouter) when available, otherwise Gemini Flash.
 * Qwen failure also falls back to Gemini, so translation never goes dark.
 */
async function translateJson<T>(
  prompt: string,
  operation: string,
  label: string,
): Promise<T | null> {
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    const qwen = await callQwen<T>(prompt, operation, label);
    if (qwen) return qwen;
    console.warn(`[translate] Qwen failed for ${operation}/${label}, falling back to Gemini`);
  }
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;
  return callGeminiWithRetry<T>(geminiKey, prompt, operation, label);
}

/** Call Qwen via OpenRouter's OpenAI-compatible chat completions API. */
async function callQwen<T>(
  prompt: string,
  operation: string,
  label: string,
): Promise<T | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://readflaneur.com',
          'X-Title': 'Flaneur',
        },
        body: JSON.stringify({
          model: QWEN_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        }),
      });

      if (res.status === 429) {
        if (attempt >= RETRY_DELAYS.length) return null;
        console.warn(`[translate] Qwen rate limited, retrying in ${RETRY_DELAYS[attempt]}ms...`);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      if (!res.ok) {
        console.error(`[translate] Qwen HTTP ${res.status}`);
        return null;
      }

      const data = await res.json();
      const text: string = data?.choices?.[0]?.message?.content?.trim() || '';
      if (!text) return null;

      const usage = data?.usage || {};
      recordAiUsage({
        provider: 'qwen',
        model: QWEN_MODEL,
        operation,
        kind: 'generation',
        label,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
      });

      return parseJsonLoose<T>(text);
    } catch (err) {
      console.error('[translate] Qwen call error:', err instanceof Error ? err.message : err);
      return null;
    }
  }
  return null;
}

/** Fallback: translate via Gemini Flash, with retry on quota errors. */
async function callGeminiWithRetry<T>(
  apiKey: string,
  prompt: string,
  operation: string,
  label?: string,
): Promise<T | null> {
  const ai = new GoogleGenAI({ apiKey });

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model: AI_MODELS.GEMINI_FLASH,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      recordGeminiCall(result, { operation, kind: 'generation', model: AI_MODELS.GEMINI_FLASH, label });

      const text = result.text?.trim() || '';
      return parseJsonLoose<T>(text);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isQuotaError = errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429');

      if (!isQuotaError || attempt >= RETRY_DELAYS.length) {
        console.error(`Translation failed (attempt ${attempt + 1}):`, errMsg);
        return null;
      }

      console.warn(`Quota hit, retrying in ${RETRY_DELAYS[attempt]}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
    }
  }

  return null;
}

/** Fetch a cached article translation from DB. Returns null if not found. */
export async function getArticleTranslation(
  supabase: SupabaseClient,
  articleId: string,
  lang: string
): Promise<ArticleTranslation | null> {
  const { data } = await supabase
    .from('article_translations')
    .select('headline, body, preview_text')
    .eq('article_id', articleId)
    .eq('language_code', lang)
    .single();
  return data || null;
}

/** Fetch a cached brief translation from DB. Returns null if not found. */
export async function getBriefTranslation(
  supabase: SupabaseClient,
  briefId: string,
  lang: string
): Promise<BriefTranslation | null> {
  const { data } = await supabase
    .from('brief_translations')
    .select('content, enriched_content')
    .eq('brief_id', briefId)
    .eq('language_code', lang)
    .single();
  return data || null;
}
