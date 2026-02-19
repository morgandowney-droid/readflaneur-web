/**
 * Childcare content generator using Grok web + X search,
 * then enriched with Gemini Flash for polished output.
 * Generates family-focused content for specific age bands in a neighborhood.
 */

import { GoogleGenAI } from '@google/genai';
import { grokEventSearch } from '@/lib/grok';
import { insiderPersona } from '@/lib/ai-persona';
import { AgeBand, AGE_BAND_DEFS, getBandContentFocus } from './age-bands';
import { AI_MODELS } from '@/config/ai-models';

interface ChildcareContentResult {
  headline: string;
  bodyText: string;
  model: string;
}

/**
 * Strip Grok citation markers from text.
 * Handles [[1]](url), [1], and (1) patterns.
 */
function stripCitations(text: string): string {
  return text
    .replace(/\[\[\d+\]\]\([^)]*\)/g, '') // [[1]](url)
    .replace(/\[\d+\]/g, '')              // [1]
    .replace(/\s*\(\d+\)/g, '')           // (1)
    .replace(/https?:\/\/\S+/g, '')       // bare URLs
    .replace(/\s{2,}/g, ' ')             // collapse double spaces
    .trim();
}

/**
 * Enrich raw Grok content with Gemini Flash for polished, organized output.
 */
async function enrichWithGemini(
  rawHeadline: string,
  rawBody: string,
  neighborhoodName: string,
  cityName: string,
  ageBands: AgeBand[],
): Promise<{ headline: string; bodyText: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[childcare] GEMINI_API_KEY not set, skipping enrichment');
    return null;
  }

  const location = `${neighborhoodName}, ${cityName}`;
  const bandDescriptions = ageBands
    .map(b => AGE_BAND_DEFS.find(d => d.band === b)?.label || b)
    .join(', ');

  const persona = insiderPersona(location, 'Family Editor');

  const prompt = `${persona}

You are rewriting a Family Corner section for the Flaneur daily email newsletter. This section helps parents in ${location} find activities for their children this week.

RAW CONTENT FROM RESEARCH:
Headline: ${rawHeadline}
Body: ${rawBody}

AGE GROUPS TO COVER: ${bandDescriptions}

REWRITE RULES:
1. Write a single concise headline (max 80 chars) that captures the best family activity or theme
2. Organize the body into one short paragraph per age group, using the age group name as a bold label (e.g., **Toddler (19mo-5yr)**:)
3. Each paragraph should mention 1-2 specific activities with dates, times, and locations when available
4. Write in a warm, practical tone - you're one parent helping another
5. Keep the total body under 250 words
6. ONLY mention events happening in the next 7 days or ongoing programs available NOW
7. Remove any enrollment deadlines months away, seasonal camps not yet open, or future programs
8. Do NOT include any URLs, citations, or source references
9. Do NOT use em dashes. Use commas, periods, or hyphens instead

Return EXACTLY in this format:
HEADLINE: [your headline]
BODY: [your organized paragraphs]`;

  try {
    const genAI = new GoogleGenAI({ apiKey });
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: prompt,
      config: {
        temperature: 0.6,
      },
    });

    const text = response.text?.trim();
    if (!text) return null;

    const headlineMatch = text.match(/HEADLINE:\s*(.+?)(?:\n|$)/);
    const bodyMatch = text.match(/BODY:\s*([\s\S]+)/);

    if (!headlineMatch || !bodyMatch) return null;

    return {
      headline: stripCitations(headlineMatch[1].trim()),
      bodyText: stripCitations(bodyMatch[1].trim()),
    };
  } catch (err) {
    console.error('[childcare] Gemini enrichment failed:', err);
    return null;
  }
}

/**
 * Generate family corner content for a neighborhood + age band combination.
 * Uses Grok with web_search + x_search to find current family events,
 * then enriches with Gemini Flash for polished output.
 */
export async function generateChildcareContent(
  neighborhoodName: string,
  cityName: string,
  ageBands: AgeBand[],
): Promise<ChildcareContentResult | null> {
  const contentFocus = getBandContentFocus(ageBands);
  const location = `${neighborhoodName}, ${cityName}`;

  const bandSections = ageBands
    .map(b => {
      const def = AGE_BAND_DEFS.find(d => d.band === b);
      return def ? `- ${def.label}: ${def.contentFocus}` : '';
    })
    .filter(Boolean)
    .join('\n');

  const systemPrompt = `You are a local news/events researcher specializing in family and children's activities. Your job is to find current, verified family events and resources.`;

  const today = new Date().toISOString().split('T')[0];
  const userPrompt = `Find family-oriented events, activities, and resources happening in or near ${location} for children in these specific age groups:

${bandSections}

Today's date: ${today}. ONLY include events happening in the next 7 days or ongoing programs available NOW. Do NOT include future enrollment dates, programs starting months from now, or seasonal camps not yet open.

IMPORTANT: You MUST find at least one relevant activity for EACH age group listed above. Structure your response with a dedicated section for each age group.

Look for:
- Children's events at local venues, libraries, parks, community centers
- New family-friendly business openings or programs
- Playground or park updates
- Family-focused community events
- Age-appropriate classes or workshops happening this week

Return your response in this exact format:
HEADLINE: [A single compelling headline summarizing the top family news, max 80 chars]
BODY: [One paragraph per age group, clearly labeled. Include specific dates, times, locations, and ages where available. Keep it practical and actionable for parents. Max 400 words total.]`;

  const response = await grokEventSearch(systemPrompt, userPrompt);
  if (!response) return null;

  // Parse HEADLINE: and BODY: sections
  const headlineMatch = response.match(/HEADLINE:\s*(.+?)(?:\n|$)/);
  const bodyMatch = response.match(/BODY:\s*([\s\S]+)/);

  if (!headlineMatch || !bodyMatch) {
    console.error('[childcare] Failed to parse Grok response format');
    return null;
  }

  // Strip citations from raw Grok output
  const rawHeadline = stripCitations(headlineMatch[1].trim());
  const rawBody = stripCitations(bodyMatch[1].trim());

  if (!rawHeadline || !rawBody || rawBody.length < 50) {
    console.error('[childcare] Response too short or empty');
    return null;
  }

  // Enrich with Gemini Flash for polished output
  const enriched = await enrichWithGemini(
    rawHeadline,
    rawBody,
    neighborhoodName,
    cityName,
    ageBands,
  );

  if (enriched) {
    return {
      headline: enriched.headline,
      bodyText: enriched.bodyText,
      model: `${AI_MODELS.GROK_FAST} + ${AI_MODELS.GEMINI_FLASH}`,
    };
  }

  // Fallback: use citation-stripped Grok output
  return {
    headline: rawHeadline,
    bodyText: rawBody,
    model: AI_MODELS.GROK_FAST,
  };
}
