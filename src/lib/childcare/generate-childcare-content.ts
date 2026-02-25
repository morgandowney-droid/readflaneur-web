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

  const prompt = `You are a 35-year-old parent living in ${location}. You know every playground, every library storytime, every after-school program. You are writing the Family Corner section of the Flaneur daily email newsletter, parent to parent.

VOICE RULES:
- Write as "you" and "your" - never "our" or "residents" or third person. "Your toddler will love" not "Toddlers might enjoy". "Your teen should check out" not "Teens might appreciate".
- Be direct and practical, not clinical or verbose. "For burning off energy" not "For those seeking consistent activity". "A chance for myth-inspired writing" not "a unique opportunity for myth-inspired writing".
- Skip filler adjectives like "lovely", "engaging", "wonderful", "perfect". Just say what the activity IS.
- Sound like a friend texting you a tip, not a brochure.
- Do NOT use em dashes. Use commas, periods, or hyphens instead.

RAW CONTENT FROM RESEARCH:
Headline: ${rawHeadline}
Body: ${rawBody}

AGE GROUPS TO COVER: ${bandDescriptions}

HEADLINE RULES:
- Write a short, intriguing headline (max 50 chars) that makes a parent curious
- Name a specific activity, venue, or event - never generic "Fun for Kids" or "{Neighborhood} Fun:"
- No neighborhood name prefix. No "for your kids" suffix. No colons.
- Good examples: "Baggywrinkle crafts at the Seaport", "Kindie Rock at Battery Park", "Pier 25 drop-ins all week"
- Bad examples: "Tribeca Fun: BPC Play, Art & Music for Your Kids", "Family Activities This Week"

STRUCTURE RULES:
1. For EACH age group, organize into TWO sub-sections:
   - **[Age Group] - Today:** 1 specific activity happening today (with time, location)
   - **[Age Group] - Next 2 Days:** 1-2 activities happening tomorrow or the day after (with dates, times, locations)
2. If there is genuinely nothing for an age group on a given day, SKIP that sub-section entirely. NEVER write "No specific events today" or "Nothing scheduled" or any variation - these waste the reader's time. Just omit the sub-section.
3. If an age group has nothing for today AND nothing for the next 2 days, mention ONE ongoing drop-in option in a single sub-section (no "Today" / "Next 2 Days" split needed)
4. Keep each sub-section to 1-2 sentences max
5. Keep total body under 300 words
6. ONLY mention events happening today, tomorrow, or the day after (3-day window) plus ongoing drop-in programs
7. Remove any enrollment deadlines months away or seasonal camps not yet open
8. Do NOT include any URLs, citations, or source references

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

Today's date: ${today}. ONLY include events happening TODAY, TOMORROW, or the day after (3-day window) plus ongoing drop-in programs available NOW. Do NOT include future enrollment dates, programs starting months from now, or seasonal camps not yet open.

IMPORTANT: You MUST find at least one relevant activity for EACH age group listed above. Structure your response with a dedicated section for each age group.

Look for:
- Children's events at local venues, libraries, parks, community centers
- New family-friendly business openings or programs
- Playground or park updates
- Family-focused community events
- Age-appropriate classes or workshops happening this week

Return your response in this exact format:
HEADLINE: [Short intriguing headline naming a specific activity or venue, max 50 chars. No neighborhood name. No "for kids" suffix.]
BODY: [One paragraph per age group, clearly labeled. Include specific dates, times, locations, and ages where available. Keep it practical and actionable for parents. If nothing found for a day, skip it - never say "no events". Max 400 words total.]`;

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
