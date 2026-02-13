import { GoogleGenAI } from '@google/genai';
import { AI_MODELS } from '@/config/ai-models';
import type { SupabaseClient } from '@supabase/supabase-js';

export type LanguageCode = 'sv' | 'fr' | 'de' | 'es' | 'ja';

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  sv: 'Swedish',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  ja: 'Japanese',
};

const RETRY_DELAYS = [2000, 5000, 15000];

interface ArticleTranslation {
  headline: string;
  body: string;
  preview_text: string | null;
}

interface BriefTranslation {
  content: string;
  enriched_content: string | null;
}

/** Translate article fields via Gemini Flash. Returns null on failure. */
export async function translateArticle(
  headline: string,
  body: string,
  previewText: string | null,
  targetLang: LanguageCode
): Promise<ArticleTranslation | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

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
${body}
${previewText ? `\nPREVIEW TEXT:\n${previewText}` : ''}`;

  return callGeminiWithRetry<ArticleTranslation>(apiKey, prompt);
}

/** Translate brief content via Gemini Flash. Returns null on failure. */
export async function translateBrief(
  content: string,
  enrichedContent: string | null,
  targetLang: LanguageCode
): Promise<BriefTranslation | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

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

  return callGeminiWithRetry<BriefTranslation>(apiKey, prompt);
}

async function callGeminiWithRetry<T>(apiKey: string, prompt: string): Promise<T | null> {
  const ai = new GoogleGenAI({ apiKey });

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model: AI_MODELS.GEMINI_FLASH,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const text = result.text?.trim() || '';
      const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      return JSON.parse(cleaned) as T;
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
