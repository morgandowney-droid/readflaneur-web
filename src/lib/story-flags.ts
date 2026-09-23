/**
 * Editor-first flags on each morning's stories.
 *
 * Asked for by Russmedia's Head of AI Studio on the 22 Sep 2026 call: before a
 * story goes into the free feed, show an editor the ones to look at first,
 * the ones worth a reporter, a follow-up or the paywall, and the ones that need
 * a legal check. A brief's stories already exist in structured form in
 * `neighborhood_briefs.enriched_categories` (category, a short title, a summary,
 * a source link); this classifies each one and stores the result in
 * `neighborhood_briefs.story_flags`.
 *
 * Two layers, the house pattern. A model judges importance, which is a matter
 * of editorial judgement. Fixed rules make sure a story mentioning police,
 * courts, deaths, injuries or accidents is ALWAYS marked for a legal check,
 * whatever the model says, because asking a model reduces a miss and only a
 * deterministic check removes it.
 *
 * The flags sit alongside the editions. They do not hold or change anything
 * that publishes.
 */
import { GoogleGenAI } from '@google/genai';
import { AI_MODELS } from '@/config/ai-models';
import { recordGeminiCall } from '@/lib/ai-cost';
// The fixed rules live in sensitive-story-rules.ts so the edition-rules filter
// (which decides what publishes) and this desk (which only flags) share one
// definition and cannot drift.
import { sensitiveRuleHits } from '@/lib/sensitive-story-rules';
export { sensitiveRuleHits };

export type Importance = 'high' | 'medium' | 'low';

export const FLAG_REASONS = [
  'breaking',
  'public-safety',
  'crime-or-court',
  'death-or-injury',
  'minors',
  'named-person',
  'civic-decision',
  'planning-or-development',
  'business-change',
  'money',
  'controversy',
  'follow-up',
] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export interface BriefStory {
  index: number;
  category: string;
  title: string;
  summary: string;
  sourceName: string | null;
  sourceUrl: string | null;
}

export interface StoryFlag {
  index: number;
  title: string;
  category: string;
  importance: Importance;
  sensitive: boolean;
  editorFirst: boolean;
  reasons: FlagReason[];
  why: string;
  /** Which fixed rules fired, if any. Empty when the model alone decided. */
  ruleHits: string[];
}

export interface StoryFlags {
  version: 1;
  model: string;
  flaggedAt: string;
  stories: StoryFlag[];
}

interface RawCategory {
  name?: string;
  stories?: Array<{
    entity?: string;
    context?: string;
    source?: { name?: string; url?: string } | null;
  }>;
}

/** The brief's stories, flattened in reading order with stable indexes. */
export function briefStories(enrichedCategories: unknown): BriefStory[] {
  if (!Array.isArray(enrichedCategories)) return [];
  const out: BriefStory[] = [];
  for (const cat of enrichedCategories as RawCategory[]) {
    for (const s of cat?.stories || []) {
      const title = (s?.entity || '').trim();
      const summary = (s?.context || '').trim();
      if (!title && !summary) continue;
      out.push({
        index: out.length,
        category: (cat?.name || '').trim(),
        title: title || summary.slice(0, 80),
        summary,
        sourceName: s?.source?.name?.trim() || null,
        sourceUrl: s?.source?.url?.trim() || null,
      });
    }
  }
  return out;
}

function buildPrompt(place: string, country: string, stories: BriefStory[]): string {
  const list = stories
    .map((s) => `[${s.index}] ${s.category ? `(${s.category}) ` : ''}${s.title}\n${s.summary}${s.sourceName ? `\nSource: ${s.sourceName}` : ''}`)
    .join('\n\n');
  return `You are the morning desk editor at the regional newspaper group that covers ${place}, ${country}. The stories below were gathered for this morning's local edition. Decide which ones an editor should look at before they go into the free feed.

For each story give:
- "importance":
  "high" = an editor would want to assign a reporter, follow it up, or put it behind the paywall. Breaking or first reports, public safety, crime and courts, deaths, significant council or planning decisions, large developments, closures, insolvencies or major openings, controversy, public money at stake, anything that could lead a local paper.
  "medium" = worth its line in the free feed, and a reporter could add something.
  "low" = listings and routine: events, markets, recurring activities, exhibitions, property listings, weather.
- "sensitive": true when publishing needs a legal check first. Crime, courts, deaths, injuries, accidents, minors, the health of a named person, or allegations against a named person or business.
- "reasons": zero or more of ${FLAG_REASONS.map((r) => `"${r}"`).join(', ')}.
- "why": one plain sentence for the editor, at most 20 words, saying what makes it matter or what to check. No hype.

Judge by local news value, not by how interesting the writing is. Most mornings, most stories are medium or low.

Return only JSON, one entry per story, using the same index numbers:
{"stories":[{"index":0,"importance":"low","sensitive":false,"reasons":[],"why":"..."}]}

STORIES:
${list}`;
}

interface ModelEntry {
  index?: number;
  importance?: string;
  sensitive?: boolean;
  reasons?: string[];
  why?: string;
}

/**
 * Classify one brief's stories. Returns null if the model call fails, so the
 * caller leaves the brief unflagged and the next run retries it.
 */
export async function classifyBriefStories(
  place: string,
  country: string,
  stories: BriefStory[],
  label?: string,
): Promise<StoryFlags | null> {
  const flaggedAt = new Date().toISOString();
  if (stories.length === 0) return { version: 1, model: 'none', flaggedAt, stories: [] };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  let entries: ModelEntry[];
  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: [{ role: 'user', parts: [{ text: buildPrompt(place, country, stories) }] }],
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    recordGeminiCall(result, { operation: 'flag_brief_stories', kind: 'generation', model: AI_MODELS.GEMINI_FLASH, label });
    const parsed = JSON.parse((result.text || '').trim()) as { stories?: ModelEntry[] };
    entries = Array.isArray(parsed?.stories) ? parsed.stories : [];
  } catch (err) {
    console.error('[story-flags] classification failed:', err instanceof Error ? err.message : err);
    return null;
  }

  const byIndex = new Map<number, ModelEntry>();
  for (const e of entries) if (typeof e?.index === 'number') byIndex.set(e.index, e);

  const flags: StoryFlag[] = stories.map((s) => {
    const e = byIndex.get(s.index) || {};
    const importance: Importance = e.importance === 'high' || e.importance === 'medium' ? e.importance : 'low';
    const modelReasons = (e.reasons || []).filter((r): r is FlagReason => (FLAG_REASONS as readonly string[]).includes(r));
    const ruleHits = sensitiveRuleHits(s);
    const sensitive = Boolean(e.sensitive) || ruleHits.length > 0;
    const reasons = Array.from(new Set<FlagReason>([...modelReasons, ...ruleHits]));
    return {
      index: s.index,
      title: s.title,
      category: s.category,
      importance,
      sensitive,
      editorFirst: importance === 'high' || sensitive,
      reasons,
      why: (e.why || '').trim().slice(0, 240),
      ruleHits,
    };
  });

  return { version: 1, model: AI_MODELS.GEMINI_FLASH, flaggedAt, stories: flags };
}
