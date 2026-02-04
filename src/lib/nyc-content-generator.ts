/**
 * NYC Content Generator
 *
 * Generates neighborhood-specific stories from NYC Open Data using Gemini.
 * Injects editorial tone and contextual instructions per neighborhood.
 */

import { GoogleGenAI } from '@google/genai';
import {
  FLANEUR_NYC_CONFIG,
  NEIGHBORHOOD_CONTEXT,
  NEIGHBORHOOD_ID_TO_CONFIG,
} from '@/config/nyc-locations';
import { NYCPermit, categorizePermit } from './nyc-permits';
import { LiquorLicense, categorizeLicense, isNewLicense } from './nyc-liquor';
import { CrimeStats, summarizeCrimeStats } from './nyc-crime';

// Gemini configuration
const GEMINI_MODEL = 'gemini-3-pro-preview';

export interface StoryInput {
  neighborhoodKey: string;
  dataType: 'permit' | 'liquor' | 'crime' | 'mixed';
  permits?: NYCPermit[];
  licenses?: LiquorLicense[];
  crimeStats?: CrimeStats;
}

export interface GeneratedStory {
  headline: string;
  body: string;
  previewText: string;
  dataType: string;
  neighborhoodKey: string;
  sourcesCount: number;
}

export interface WeeklyDigest {
  neighborhoodKey: string;
  neighborhoodId: string;
  headline: string;
  body: string;
  previewText: string;
  permitCount: number;
  licenseCount: number;
  crimeIncidents: number;
  generatedAt: string;
}

/**
 * Get the Flâneur editorial tone for a neighborhood
 */
function getNeighborhoodTone(neighborhoodKey: string): string {
  const config = FLANEUR_NYC_CONFIG[neighborhoodKey];
  return config?.tone || 'Local NYC neighborhood news and developments';
}

/**
 * Get contextual writing instructions for a neighborhood
 */
function getContextualInstructions(neighborhoodKey: string): string {
  return NEIGHBORHOOD_CONTEXT[neighborhoodKey] || '';
}

/**
 * Format permits for the prompt
 */
function formatPermitsForPrompt(permits: NYCPermit[]): string {
  if (permits.length === 0) return 'No notable permits this period.';

  const formatted = permits.slice(0, 10).map((p) => {
    const category = categorizePermit(p);
    return `- ${p.address}: ${p.job_description} (${category}, filed ${p.filing_date})`;
  });

  return formatted.join('\n');
}

/**
 * Format licenses for the prompt
 */
function formatLicensesForPrompt(licenses: LiquorLicense[]): string {
  if (licenses.length === 0) return 'No notable license activity this period.';

  const formatted = licenses.slice(0, 10).map((l) => {
    const category = categorizeLicense(l);
    const isNew = isNewLicense(l) ? '[NEW]' : '[RENEWAL]';
    return `- ${l.premises_name} at ${l.address}: ${l.license_type} ${isNew} (${category})`;
  });

  return formatted.join('\n');
}

/**
 * Format crime stats for the prompt
 */
function formatCrimeStatsForPrompt(stats: CrimeStats): string {
  const summary = summarizeCrimeStats(stats);
  const topCategories = Object.entries(stats.by_category)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, count]) => `  - ${cat}: ${count}`)
    .join('\n');

  return `Period: ${stats.period_start} to ${stats.period_end}
Total incidents: ${stats.total_incidents}
Breakdown:
${topCategories}

Summary: ${summary}`;
}

/**
 * Generate a story from NYC Open Data
 */
export async function generateNYCStory(
  input: StoryInput
): Promise<GeneratedStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });
  const tone = getNeighborhoodTone(input.neighborhoodKey);
  const contextualInstruction = getContextualInstructions(input.neighborhoodKey);

  // Build data section based on type
  let dataSection = '';
  let sourcesCount = 0;

  if (input.permits && input.permits.length > 0) {
    dataSection += `## Building Permits\n${formatPermitsForPrompt(input.permits)}\n\n`;
    sourcesCount += input.permits.length;
  }

  if (input.licenses && input.licenses.length > 0) {
    dataSection += `## Liquor Licenses\n${formatLicensesForPrompt(input.licenses)}\n\n`;
    sourcesCount += input.licenses.length;
  }

  if (input.crimeStats) {
    dataSection += `## Safety Statistics\n${formatCrimeStatsForPrompt(input.crimeStats)}\n\n`;
    sourcesCount += 1;
  }

  if (!dataSection) {
    console.log(`No data to generate story for ${input.neighborhoodKey}`);
    return null;
  }

  const systemPrompt = `You are the Editor for Flâneur, a hyperlocal neighborhood newsletter.
You are writing for the "${input.neighborhoodKey}" feed.

Target Audience Vibe: ${tone}

Writing Guidelines:
- Write in a conversational, insider tone - you know this neighborhood intimately
- Reference specific streets and landmarks, NEVER mention zip codes
- Be specific with addresses and details from the data
- If covering multiple topics, use clear section breaks
- Keep it punchy and scannable - busy New Yorkers are reading this
- Do not editorialize on crime stats - present them factually

${contextualInstruction ? `Contextual Instructions:\n${contextualInstruction}\n` : ''}

IMPORTANT:
- Do NOT mention zip codes in your writing
- DO mention specific streets, intersections, and landmarks
- Write as if you discovered this news yourself, not from data
- Keep headlines under 70 characters`;

  const prompt = `Based on the following NYC public data, write a neighborhood update for ${input.neighborhoodKey}.

${dataSection}

Write a brief headline and body. The body should be 2-4 paragraphs covering the most interesting findings.

Return your response in this JSON format:
{
  "headline": "Your headline here (under 70 chars)",
  "body": "Your full article body here with paragraph breaks",
  "previewText": "1-2 sentence teaser for the feed"
}`;

  try {
    const response = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: {
        temperature: 0.7,
      },
    });

    const rawText = response.text || '';

    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from Gemini response');
      console.log('Raw response:', rawText.substring(0, 500));
      return null;
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        headline: parsed.headline || `What's New in ${input.neighborhoodKey}`,
        body: parsed.body || rawText,
        previewText: parsed.previewText || parsed.body?.substring(0, 150) || '',
        dataType: input.dataType,
        neighborhoodKey: input.neighborhoodKey,
        sourcesCount,
      };
    } catch (parseErr) {
      console.error('Failed to parse Gemini JSON:', parseErr);
      return null;
    }
  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}

/**
 * Generate a weekly digest combining all NYC data sources
 */
export async function generateWeeklyDigest(
  neighborhoodId: string,
  permits: NYCPermit[],
  licenses: LiquorLicense[],
  crimeStats?: CrimeStats
): Promise<WeeklyDigest | null> {
  const neighborhoodKey = NEIGHBORHOOD_ID_TO_CONFIG[neighborhoodId];
  if (!neighborhoodKey) {
    console.error(`Unknown neighborhood ID: ${neighborhoodId}`);
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });
  const tone = getNeighborhoodTone(neighborhoodKey);
  const contextualInstruction = getContextualInstructions(neighborhoodKey);

  // Build comprehensive data section
  let dataSection = `# Weekly Data Summary for ${neighborhoodKey}\n\n`;

  if (permits.length > 0) {
    dataSection += `## Building Permits (${permits.length} total)\n`;
    dataSection += formatPermitsForPrompt(permits);
    dataSection += '\n\n';
  }

  if (licenses.length > 0) {
    const newLicenses = licenses.filter(isNewLicense);
    dataSection += `## Liquor Licenses (${licenses.length} total, ${newLicenses.length} new)\n`;
    dataSection += formatLicensesForPrompt(licenses);
    dataSection += '\n\n';
  }

  if (crimeStats) {
    dataSection += `## Safety Statistics\n`;
    dataSection += formatCrimeStatsForPrompt(crimeStats);
    dataSection += '\n\n';
  }

  const systemPrompt = `You are the Editor for Flâneur writing a weekly civic digest for ${neighborhoodKey}.

Editorial Tone: ${tone}

${contextualInstruction ? `Focus Area:\n${contextualInstruction}\n\n` : ''}

Writing Style:
- Authoritative local journalism - you are THE source for neighborhood news
- Specific addresses and landmarks, never zip codes
- Cover the most interesting developments first
- Use section headers like "[[Development Watch]]", "[[New on the Block]]", "[[Safety Snapshot]]"
- Be factual about crime stats - no editorializing
- End with something forward-looking if possible

This is a weekly recap digest - substantive but readable in 3-4 minutes.`;

  const prompt = `Write a comprehensive weekly digest for ${neighborhoodKey} based on this week's public data.

${dataSection}

Structure your article with:
1. A compelling headline (under 70 chars)
2. A brief intro (1-2 sentences)
3. Sections for notable permits/developments, liquor license news, and safety stats
4. Use [[Section Header]] format for headers

Return JSON:
{
  "headline": "Your headline",
  "body": "Full article with [[Section Headers]] and paragraphs",
  "previewText": "1-2 sentence teaser"
}`;

  try {
    const response = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: {
        temperature: 0.6,
      },
    });

    const rawText = response.text || '';

    // Extract JSON
    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from weekly digest response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      neighborhoodKey,
      neighborhoodId,
      headline: parsed.headline || `This Week in ${neighborhoodKey}`,
      body: parsed.body || rawText,
      previewText: parsed.previewText || '',
      permitCount: permits.length,
      licenseCount: licenses.length,
      crimeIncidents: crimeStats?.total_incidents || 0,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Weekly digest generation error:', error);
    throw error;
  }
}

/**
 * Generate a brief context snippet for daily briefs
 * Used to inject NYC data mentions into the main brief generation
 */
export async function generateBriefContextSnippet(
  neighborhoodId: string,
  permits: NYCPermit[],
  licenses: LiquorLicense[]
): Promise<string | null> {
  // Filter to most interesting items
  const notablePermits = permits
    .filter((p) => {
      const cat = categorizePermit(p);
      return ['restaurant', 'retail', 'new_construction', 'rooftop'].includes(cat);
    })
    .slice(0, 3);

  const newLicenses = licenses.filter(isNewLicense).slice(0, 3);

  if (notablePermits.length === 0 && newLicenses.length === 0) {
    return null;
  }

  // Build a simple context snippet without calling AI
  const snippets: string[] = [];

  if (notablePermits.length > 0) {
    const permitMentions = notablePermits
      .map((p) => {
        const cat = categorizePermit(p);
        if (cat === 'restaurant') {
          return `a new restaurant permit was filed at ${p.address}`;
        }
        if (cat === 'retail') {
          return `a retail space permit was filed at ${p.address}`;
        }
        if (cat === 'rooftop') {
          return `a rooftop/outdoor space permit was filed at ${p.address}`;
        }
        return `construction permit filed at ${p.address}`;
      })
      .slice(0, 2);

    snippets.push(
      `DOB records show ${permitMentions.join(' and ')}`
    );
  }

  if (newLicenses.length > 0) {
    const licenseMentions = newLicenses
      .map((l) => `${l.premises_name} at ${l.address}`)
      .slice(0, 2);

    snippets.push(
      `New liquor licenses were issued to ${licenseMentions.join(' and ')}`
    );
  }

  return snippets.join('. ') + '.';
}
