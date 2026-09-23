/**
 * Edition rules, enrichment-time pass: the second-model review plus the
 * deterministic filter from edition-rules.ts.
 *
 * Runs once per enrichment, and only for editions with rules, so the cost is a
 * single Gemini Flash call per edition per run (about eight calls a day for the
 * four GEDI editions, brief and Look Ahead).
 *
 * The review checks each surviving story against the material the pipeline
 * actually holds (the search facts handed to the enricher and the titles of the
 * pages Google Search grounding read) and classifies it against the topic
 * rules. It returns keep or drop; it never rewrites. The decision itself stays
 * deterministic: the model supplies verdicts, edition-rules.ts applies the rules.
 *
 * If the call fails, the review fails closed only for stories that appear to
 * name a person; the rest keep, because every other rule has already been
 * applied deterministically.
 */
import { GoogleGenAI } from '@google/genai';
import { AI_MODELS } from '@/config/ai-models';
import { recordGeminiCall } from '@/lib/ai-cost';
import type { GroundingChunk } from '@/lib/source-links';
import {
  applyEditionRules,
  attachSecondSources,
  decideStories,
  fallbackTeaser,
  filterTeaserSentences,
  flattenStories,
  mapStoriesToProse,
  mentionsDroppedStory,
  type EditionRules,
  type ListingEvent,
  type ModelVerdict,
  type Removal,
  type RuleStory,
} from '@/lib/edition-rules';

const MAX_SOURCE_MATERIAL = 14_000;

function buildReviewPrompt(
  place: string,
  country: string,
  stories: Array<RuleStory & { prose: string }>,
  sourceMaterial: string,
  chunks: GroundingChunk[],
  today?: string,
): string {
  const list = stories.map((s) => {
    const sources = s.sources.map((r) => `${r.name}${r.url ? ` <${r.url}>` : ''}`).join('; ') || 'none';
    return `[${s.index}] ${s.entity}\nContext: ${s.context}\nAs written: ${s.prose || '(not found in the body)'}\nSources: ${sources}`;
  }).join('\n\n');
  const pages = chunks.slice(0, 60).map((c) => `- ${c.title || c.domain || ''} <${c.uri}>`).join('\n');
  return `You are the standards editor for a local news edition covering ${place}, ${country}, published under a newspaper group's rules. Check each story below before it is published.${today ? `

TODAY is ${today}. Resolve every relative date ("tomorrow", "this Friday", "this weekend") against it before comparing with the sources: a story saying "this Friday" for an event the sources date to the coming Friday is supported.` : ''}

For each story decide:
- "supported": true only if every specific claim (names, dates, times, figures, places) is supported by the SOURCE MATERIAL or by the source names and page titles listed. If a claim appears nowhere in them, false.
- "party_politics": true for party politics or political commentary (parties, campaigns, candidates, polls, politicians' positions). A council or city decision reported plainly is NOT party politics.
- "sports_commentary": true for match reports, results, player or coach commentary, transfer talk. A plain upcoming fixture (who, where, when) is NOT commentary.
- "active_crime": true for an active criminal matter: an arrest, investigation, charge, trial or crime under inquiry.
- "names_private_individual": true if it names a private individual, meaning anyone who is not a public figure acting in a public role (officials, business owners speaking for their business and performers are public in that role).
- "private_personal_info": true if it gives personal details about a private individual: age, home address, health, family, employment, or their involvement in an incident.
- "reason": at most 15 words, only when supported is false.

Do not rewrite anything. Return only JSON, one entry per story, same index numbers:
{"stories":[{"index":0,"supported":true,"party_politics":false,"sports_commentary":false,"active_crime":false,"names_private_individual":false,"private_personal_info":false,"reason":""}]}

STORIES:
${list}

SOURCE MATERIAL (search facts gathered for this edition):
${sourceMaterial.slice(0, MAX_SOURCE_MATERIAL) || '(none)'}

PAGES READ BY SEARCH:
${pages || '(none)'}`;
}

interface RawVerdict {
  index?: number;
  supported?: boolean;
  party_politics?: boolean;
  sports_commentary?: boolean;
  active_crime?: boolean;
  names_private_individual?: boolean;
  private_personal_info?: boolean;
  reason?: string;
}

/** One Flash call for every story in the edition. Null when the call fails. */
export async function reviewStoriesWithModel(args: {
  place: string;
  country: string;
  stories: Array<RuleStory & { prose: string }>;
  sourceMaterial: string;
  chunks: GroundingChunk[];
  label?: string;
  /** The edition's local date, e.g. "Wednesday, September 23, 2026". */
  today?: string;
}): Promise<Map<number, ModelVerdict> | null> {
  if (args.stories.length === 0) return new Map();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: [{ role: 'user', parts: [{ text: buildReviewPrompt(args.place, args.country, args.stories, args.sourceMaterial, args.chunks, args.today) }] }],
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    recordGeminiCall(result, { operation: 'edition_rules_review', kind: 'generation', model: AI_MODELS.GEMINI_FLASH, label: args.label });
    const parsed = JSON.parse((result.text || '').trim()) as { stories?: RawVerdict[] };
    const out = new Map<number, ModelVerdict>();
    for (const v of parsed?.stories || []) {
      if (typeof v?.index !== 'number' || typeof v.supported !== 'boolean') continue;
      out.set(v.index, {
        index: v.index,
        supported: v.supported,
        partyPolitics: Boolean(v.party_politics),
        sportsCommentary: Boolean(v.sports_commentary),
        activeCrime: Boolean(v.active_crime),
        namesPrivateIndividual: Boolean(v.names_private_individual),
        privatePersonalInfo: Boolean(v.private_personal_info),
        reason: (v.reason || '').trim().slice(0, 160) || undefined,
      });
    }
    return out;
  } catch (err) {
    console.error('[edition-rules] review failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export interface EnforceResult<E extends ListingEvent> {
  body: string;
  categories: unknown[];
  events: E[];
  subjectTeaser: string | null;
  emailTeaser: string | null;
  removals: Removal[];
  droppedStories: RuleStory[];
  keptStories: number;
  reviewStatus: 'ok' | 'failed' | 'skipped';
  secondSourcesAttached: number;
}

/**
 * The full enrichment-time pass: attach second sources from grounding, run the
 * deterministic rules once to find the stories still standing, review those
 * with the model, then apply the rules again with the verdicts and repair the
 * teasers.
 */
export async function enforceEditionRules<E extends ListingEvent>(args: {
  rules: EditionRules;
  body: string;
  categories: unknown;
  events?: E[];
  subjectTeaser: string | null;
  emailTeaser: string | null;
  sourceMaterial: string;
  chunks: GroundingChunk[];
  place: string;
  country: string;
  placeNames: string[];
  label?: string;
  /** The edition's local date, so the review resolves "this Friday" correctly. */
  today?: string;
}): Promise<EnforceResult<E>> {
  const { rules, placeNames } = args;
  const secondSourcesAttached = attachSecondSources(args.categories, args.chunks, rules);

  // Review only what the fixed rules leave standing; no point paying to check
  // a story that is going anyway.
  const stories = flattenStories(args.categories);
  const prose = mapStoriesToProse(args.body, stories, placeNames);
  const preliminary = decideStories(stories, rules, new Map(), prose, false);
  const toReview = stories
    .filter((s) => preliminary[s.index]?.keep)
    .map((s) => ({ ...s, prose: prose.get(s.index) || '' }));

  let verdicts: Map<number, ModelVerdict> | null = new Map();
  let reviewStatus: EnforceResult<E>['reviewStatus'] = 'skipped';
  if (toReview.length > 0) {
    verdicts = await reviewStoriesWithModel({
      place: args.place,
      country: args.country,
      stories: toReview,
      sourceMaterial: args.sourceMaterial,
      chunks: args.chunks,
      label: args.label,
      today: args.today,
    });
    reviewStatus = verdicts ? 'ok' : 'failed';
  }

  const applied = applyEditionRules<E>({
    body: args.body,
    categories: args.categories,
    rules,
    verdicts,
    reviewRequired: true,
    events: args.events,
    placeNames,
  });

  let subjectTeaser = args.subjectTeaser;
  let emailTeaser = args.emailTeaser;
  if (applied.droppedStories.length > 0) {
    if (mentionsDroppedStory(subjectTeaser, applied.droppedStories, placeNames)) {
      subjectTeaser = fallbackTeaser(applied.categories);
      applied.removals.push({ header: 'Subject teaser', rule: 'about-a-dropped-story' });
    }
    const et = filterTeaserSentences(emailTeaser, applied.droppedStories, placeNames);
    if (et !== emailTeaser) {
      emailTeaser = et;
      applied.removals.push({ header: 'Email teaser', rule: 'about-a-dropped-story' });
    }
  }

  return {
    body: applied.body,
    categories: applied.categories,
    events: applied.events,
    subjectTeaser,
    emailTeaser,
    removals: applied.removals,
    droppedStories: applied.droppedStories,
    keptStories: applied.keptStories,
    reviewStatus,
    secondSourcesAttached,
  };
}
