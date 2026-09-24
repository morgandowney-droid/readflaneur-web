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
