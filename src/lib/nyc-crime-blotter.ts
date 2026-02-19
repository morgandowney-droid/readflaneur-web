/**
 * NYC Crime Blotter Service
 *
 * Uses Grok web_search + x_search to find near-real-time crime,
 * police, and emergency activity for each NYC neighborhood.
 *
 * The NYPD Open Data API updates quarterly (too slow for daily use),
 * so we use Grok to search local news, X posts, Citizen app reports,
 * and NYPD precinct accounts for the last 24 hours.
 */

import { grokEventSearch } from './grok';
import { GoogleGenAI } from '@google/genai';
import { AI_MODELS } from '@/config/ai-models';
import { insiderPersona } from '@/lib/ai-persona';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';

export interface BlotterIncident {
  description: string;
  location: string;
  time: string;
  type: string;
  severity: 'major' | 'notable' | 'minor';
  source?: string;
}

export interface BlotterStory {
  neighborhoodId: string;
  neighborhoodName: string;
  headline: string;
  body: string;
  previewText: string;
  incidentCount: number;
  generatedAt: string;
}

/**
 * Fetch recent crime/police/emergency activity for a neighborhood via Grok
 */
export async function fetchBlotterIncidents(
  neighborhoodName: string,
  precincts: string[]
): Promise<BlotterIncident[]> {
  const precinctText = precincts.length > 0
    ? ` (NYPD ${precincts.join(', ')})`
    : '';

  const systemPrompt = `You are a crime and safety data researcher. Search X posts, local news sites (Gothamist, NY Post, Patch, CBS New York, ABC7NY, PIX11), Citizen app reports, and NYPD precinct accounts for recent crime, police, ambulance, and fire activity in ${neighborhoodName}, Manhattan/Brooklyn, New York${precinctText}.

Focus ONLY on the last 24 hours. Include:
- Violent crimes (assaults, robberies, shootings)
- Major thefts (grand larceny, car theft)
- Police operations (arrests, perimeter setups)
- Emergency responses (fires, gas leaks, building collapses)
- Notable incidents (hit-and-runs, DUI arrests, protests turning violent)

Exclude:
- Minor violations (jaywalking, noise complaints)
- Old news or cold cases
- National/political news
- Unverified rumors without a source

Return a JSON array of incidents. If no notable incidents found, return an empty array [].

Each incident:
{
  "description": "Brief factual description of what happened",
  "location": "Specific location (intersection, block, venue name)",
  "time": "When it happened (e.g. 'Tuesday 2:30 AM', 'overnight', 'early morning')",
  "type": "One of: assault, robbery, theft, shooting, stabbing, fire, accident, arrest, emergency, other",
  "severity": "major (felony/life-threatening) or notable (newsworthy but not life-threatening) or minor",
  "source": "Where you found this (e.g. 'NY Post', '@NYPDnews', 'Citizen')"
}`;

  const userPrompt = `Search for crime, police activity, ambulance calls, fires, or safety incidents in ${neighborhoodName}, New York in the last 24 hours. Return JSON array only.`;

  const rawResponse = await grokEventSearch(systemPrompt, userPrompt);
  if (!rawResponse) return [];

  try {
    // Extract JSON array from response
    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log(`No JSON array in Grok blotter response for ${neighborhoodName}`);
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    // Filter to major and notable incidents only
    return parsed.filter(
      (i: BlotterIncident) => i.severity === 'major' || i.severity === 'notable'
    );
  } catch (error) {
    console.error(`Failed to parse blotter incidents for ${neighborhoodName}:`, error);
    return [];
  }
}

/**
 * Generate a crime blotter article from incidents using Gemini
 */
export async function generateBlotterStory(
  neighborhoodId: string,
  neighborhoodName: string,
  incidents: BlotterIncident[]
): Promise<BlotterStory | null> {
  if (incidents.length === 0) return null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  const incidentList = incidents
    .map(
      (i, idx) =>
        `${idx + 1}. [${i.type.toUpperCase()}] ${i.description}\n   Location: ${i.location}\n   Time: ${i.time}\n   Severity: ${i.severity}${i.source ? `\n   Source: ${i.source}` : ''}`
    )
    .join('\n\n');

  const systemPrompt = `${insiderPersona(neighborhoodName, 'Editor')}

Writing Style:
- Factual, concise, no sensationalism
- Reference specific streets, intersections, and landmarks
- Group related incidents if applicable
- Each incident gets 1-2 sentences
- Lead with the most serious incident
- No emojis, no editorializing
- Do NOT speculate about motives or suspects beyond what is reported`;

  const prompt = `Based on these incidents reported in ${neighborhoodName} in the last 24 hours, write a brief crime blotter.

${incidentList}

Return JSON:
{
  "headline": "Headline under 60 chars - lead with the most notable incident or pattern",
  "body": "Brief blotter covering each incident in 1-2 sentences. Total 50-150 words.",
  "previewText": "One sentence teaser for the feed",
  "link_candidates": [
    {"text": "exact text from body to hyperlink"}
  ]
}

Include 1-3 link_candidates for key locations or venues mentioned.`;

  try {
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: { temperature: 0.4 },
    });

    const rawText = response.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from blotter story response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);
    let body = parsed.body || '';
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, {
        name: neighborhoodName,
        city: 'New York',
      });
    }

    return {
      neighborhoodId,
      neighborhoodName,
      headline: parsed.headline || `${neighborhoodName} Blotter`,
      body,
      previewText: parsed.previewText || `Crime and safety activity in ${neighborhoodName}.`,
      incidentCount: incidents.length,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Blotter story generation error:', error);
    return null;
  }
}
