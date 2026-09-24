/**
 * The one search call behind source repair (source-repair.ts).
 *
 * Gemini Flash with Google Search grounding, thinking off, one call per brief
 * for every story being repaired. The model's text is discarded: only the
 * pages the search tool returned (groundingMetadata.groundingChunks, with
 * their redirects resolved) are handed back, and each of those is still
 * checked in code before anything is attached. No retry: a failed or slow
 * search simply leaves the stories as they were.
 */

import { GoogleGenAI } from '@google/genai';
import { AI_MODELS } from '@/config/ai-models';
import { recordGeminiCall } from '@/lib/ai-cost';
import { extractGroundingChunks, resolveGroundingChunks } from '@/lib/source-links';
import type { RepairRequest, RepairSearch } from '@/lib/source-repair';

export function buildRepairPrompt(requests: RepairRequest[], place: string): string {
  const lines = requests.map(r =>
    `${r.n}. Publication: ${r.publication}\n   Story: ${r.entity}${r.context ? `\n   Detail: ${r.context}` : ''}`,
  );
  // Tested 2026-09-24: asked to "search the publication's site", Flash ran
  // bare searches on the story text and came back with one page from another
  // host; asked for one search per item naming the publication, it returned
  // the publication's own article for each item.
  const example = requests[0] ? `${requests[0].publication} ${requests[0].entity.replace(/\s*\([^)]*\)/g, '')}` : '';
  return `Each item below is a local news item from ${place}, with the publication that reported it. For EACH item, run its own Google search that combines the publication's name with the item's key names${example ? `, for example: ${example}` : ''}. Find the article on that publication's own website that reports the item.

${lines.join('\n\n')}

Reply with one short line per item: its number and the title of the page you found, or "not found". Do not write any URLs.`;
}

/** A RepairSearch bound to an edition. Returns [] when GEMINI_API_KEY is unset. */
export function geminiRepairSearch(opts: { place: string; label?: string; apiKey?: string }): RepairSearch {
  return async (requests, signal) => {
    const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey || requests.length === 0) return [];
    const genAI = new GoogleGenAI({ apiKey });
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: buildRepairPrompt(requests, opts.place),
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: signal,
      },
    });
    recordGeminiCall(response, { operation: 'source_repair', kind: 'search', model: AI_MODELS.GEMINI_FLASH, label: opts.label });
    return resolveGroundingChunks(extractGroundingChunks(response, 'repair'));
  };
}

/**
 * Prompt for the shadow second-source search (second-source.ts). The search
 * is asked to find another report of each item on a different site; the
 * model's answer is discarded, and only the pages its search read are used,
 * each fetched and fact-checked in code. It never reaches the writing step.
 */
export function buildSecondSourcePrompt(requests: RepairRequest[], place: string): string {
  const lines = requests.map(r =>
    `${r.n}. Already reported by: ${r.publication}\n   Story: ${r.entity}${r.context ? `\n   Detail: ${r.context}` : ''}`,
  );
  return `Each item below is a local news item from ${place} that one site has already reported. For EACH item, run its own Google search on the item's key names and find a report of the same item on a DIFFERENT website: another news outlet, or the official page of the public body, venue or organiser involved. Do not use the site that already reported it.

${lines.join('\n\n')}

Reply with one short line per item: its number and the title of the page you found, or "not found". Do not write any URLs.`;
}

/** The second-source search, bound to an edition. Returns [] when GEMINI_API_KEY is unset. */
export function geminiSecondSourceSearch(opts: { place: string; label?: string; apiKey?: string }): RepairSearch {
  return async (requests, signal) => {
    const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey || requests.length === 0) return [];
    const genAI = new GoogleGenAI({ apiKey });
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: buildSecondSourcePrompt(requests, opts.place),
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: signal,
      },
    });
    recordGeminiCall(response, { operation: 'shadow_second_source', kind: 'search', model: AI_MODELS.GEMINI_FLASH, label: opts.label });
    return resolveGroundingChunks(extractGroundingChunks(response, 'repair'));
  };
}
