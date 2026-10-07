/**
 * The one way to construct a Gemini client.
 *
 * Gemini 2.x takes `thinkingConfig.thinkingBudget` and sampling parameters
 * (temperature, topP, topK); on 2.5 Flash `thinkingBudget: 0` is what stops
 * billed thinking, so it must keep being sent there. Gemini 3 and later take
 * `thinkingLevel` instead, and Google's notice of 7 Oct 2026 says upcoming
 * models will reject `thinkingBudget` and the sampling parameters with
 * 400 INVALID_ARGUMENT. `createGemini()` rewrites each request's config for
 * the model it names, so call sites can keep one config for every model and
 * a model upgrade is a change to `src/config/ai-models.ts` only.
 */
import { GoogleGenAI, ThinkingLevel, type GoogleGenAIOptions, type GenerateContentParameters } from '@google/genai';

/** Major version of a Gemini model id, or null for anything else. */
function geminiMajor(model: string): number | null {
  const m = model.replace(/^models\//, '').match(/^gemini-(\d+)/);
  return m ? Number(m[1]) : null;
}

/** True when the model takes thinkingLevel and no sampling parameters. */
export function usesThinkingLevel(model: string): boolean {
  const major = geminiMajor(model);
  return major !== null && major >= 3;
}

function levelForBudget(budget: number): ThinkingLevel | undefined {
  if (budget < 0) return undefined; // -1 = dynamic: leave it to the model default
  // MINIMAL is not offered by every model (gemini-3.8-flash rejects it with a
  // 400, tested 7 Oct 2026); LOW is accepted and spent 0 thought tokens there.
  if (budget <= 1024) return ThinkingLevel.LOW;
  if (budget <= 8192) return ThinkingLevel.MEDIUM;
  return ThinkingLevel.HIGH;
}

/** Rewrite one request's config for its model; 2.x requests pass through unchanged. */
export function geminiParams<P extends GenerateContentParameters>(params: P): P {
  if (!params?.config || !usesThinkingLevel(params.model)) return params;
  const { temperature: _t, topP: _p, topK: _k, thinkingConfig, ...rest } = params.config;
  void _t; void _p; void _k;
  const config: GenerateContentParameters['config'] = { ...rest };
  if (thinkingConfig) {
    const { thinkingBudget, ...thinkingRest } = thinkingConfig;
    const level = thinkingRest.thinkingLevel
      ?? (typeof thinkingBudget === 'number' ? levelForBudget(thinkingBudget) : undefined);
    const next = { ...thinkingRest, ...(level ? { thinkingLevel: level } : {}) };
    if (Object.keys(next).length > 0) config.thinkingConfig = next;
  }
  return { ...params, config };
}

export function createGemini(opts: GoogleGenAIOptions): GoogleGenAI {
  const ai = new GoogleGenAI(opts);
  const models = ai.models;
  const generate = models.generateContent.bind(models);
  const stream = models.generateContentStream.bind(models);
  models.generateContent = (params) => generate(geminiParams(params));
  models.generateContentStream = (params) => stream(geminiParams(params));
  return ai;
}
