/**
 * Childcare content generator using Grok web + X search.
 * Generates family-focused content for specific age bands in a neighborhood.
 */

import { grokEventSearch } from '@/lib/grok';
import { AgeBand, getBandContentFocus } from './age-bands';
import { AI_MODELS } from '@/config/ai-models';

interface ChildcareContentResult {
  headline: string;
  bodyText: string;
  model: string;
}

/**
 * Generate family corner content for a neighborhood + age band combination.
 * Uses Grok with web_search + x_search to find current family events.
 */
export async function generateChildcareContent(
  neighborhoodName: string,
  cityName: string,
  ageBands: AgeBand[],
): Promise<ChildcareContentResult | null> {
  const contentFocus = getBandContentFocus(ageBands);
  const bandLabels = ageBands.join(', ');
  const location = `${neighborhoodName}, ${cityName}`;

  const systemPrompt = `You are a local news/events researcher specializing in family and children's activities. Your job is to find current, verified family events and resources.`;

  const today = new Date().toISOString().split('T')[0];
  const userPrompt = `Find family-oriented events, activities, and resources happening in or near ${location} that are relevant for children in these age groups: ${bandLabels}.

Content focus areas: ${contentFocus}

Today's date: ${today}. Focus on events and activities happening in the next 7 days, plus any ongoing programs or recent announcements.

Look for:
- Children's events at local venues, libraries, parks, community centers
- New family-friendly business openings or programs
- School enrollment deadlines or education news
- Playground or park updates
- Family-focused community events

Return your response in this exact format:
HEADLINE: [A single compelling headline summarizing the top family news, max 80 chars]
BODY: [2-3 short paragraphs covering the most relevant findings. Include specific dates, times, locations, and ages where available. Keep it practical and actionable for parents. Max 300 words.]`;

  const response = await grokEventSearch(systemPrompt, userPrompt);
  if (!response) return null;

  // Parse HEADLINE: and BODY: sections
  const headlineMatch = response.match(/HEADLINE:\s*(.+?)(?:\n|$)/);
  const bodyMatch = response.match(/BODY:\s*([\s\S]+)/);

  if (!headlineMatch || !bodyMatch) {
    console.error('[childcare] Failed to parse Grok response format');
    return null;
  }

  const headline = headlineMatch[1].trim();
  const bodyText = bodyMatch[1].trim();

  if (!headline || !bodyText || bodyText.length < 50) {
    console.error('[childcare] Response too short or empty');
    return null;
  }

  return {
    headline,
    bodyText,
    model: AI_MODELS.GROK_FAST,
  };
}
