/**
 * Brief Enricher using Google Gemini with Search Grounding
 *
 * Uses Gemini's built-in Google Search to find and verify sources.
 * Better at finding local-language sources (Swedish, etc.)
 */

import { GoogleGenAI } from '@google/genai';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';

export interface EnrichedStoryItem {
  entity: string;
  source: {
    name: string;
    url: string;
  } | null;
  context: string;
  note?: string;
  secondarySource?: {
    name: string;
    url: string;
  };
  googleFallbackUrl: string;
}

export interface EnrichedCategory {
  name: string;
  stories: EnrichedStoryItem[];
}

export interface EnrichedBriefOutput {
  date: string;
  neighborhood: string;
  categories: EnrichedCategory[];
  processedAt: string;
  model: string;
  blockedDomains: string[];
  rawResponse?: string;
  linkCandidates?: LinkCandidate[];
}

// Blocked domains per neighborhood
const BLOCKED_DOMAINS: Record<string, string[]> = {
  'tribeca': ['tribecacitizen.com'],
};

/**
 * Main function: Enrich a brief using Gemini with Google Search
 */
export async function enrichBriefWithGemini(
  briefContent: string,
  neighborhoodName: string,
  neighborhoodSlug: string,
  city: string,
  country: string = 'USA',
  options?: {
    apiKey?: string;
    date?: string;
    /** ISO timestamp of when the brief was generated (for correct "today"/"tomorrow" context) */
    briefGeneratedAt?: string;
    /** Article type determines writing style: 'daily_brief' includes casual intro/outro, 'weekly_recap' is direct */
    articleType?: 'daily_brief' | 'weekly_recap';
  }
): Promise<EnrichedBriefOutput> {
  const apiKey = options?.apiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const genAI = new GoogleGenAI({ apiKey });
  const blockedDomains = BLOCKED_DOMAINS[neighborhoodSlug.toLowerCase()] || [];

  // Determine the context time - use provided timestamp or current time
  const contextTime = options?.briefGeneratedAt
    ? new Date(options.briefGeneratedAt)
    : new Date();

  // Get timezone name based on country
  const timezoneMap: Record<string, string> = {
    'Sweden': 'Europe/Stockholm',
    'USA': 'America/New_York',
    'France': 'Europe/Paris',
    'Germany': 'Europe/Berlin',
    'Spain': 'Europe/Madrid',
    'Italy': 'Europe/Rome',
    'UK': 'Europe/London',
  };
  const timezone = timezoneMap[country] || 'America/New_York';

  // Format date for display (use neighborhood's timezone, not server timezone)
  const dateStr = options?.date || contextTime.toLocaleDateString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Format the context time with timezone for Gemini
  // Always present as 7 AM delivery time - briefs may be generated as early as
  // midnight but are always delivered at 7 AM local time
  const contextTimeStr = contextTime.toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).replace(/\d{1,2}:\d{2}\s*(AM|PM)/, '7:00 AM');

  // Determine language hint based on country
  const languageHint = country === 'Sweden' ? 'IMPORTANT: Search Swedish news sites like Thatsup.se, Restaurangvärlden, Mitt i, DN.se, and SVD.se. Also try Swedish search terms like "öppnar", "nytt café", "restaurang".' :
                       country === 'France' ? 'Search in both French and English. Try French news sites.' :
                       country === 'Germany' ? 'Search in both German and English. Try German news sites.' :
                       country === 'Spain' ? 'Search in both Spanish and English. Try Spanish news sites.' :
                       country === 'Italy' ? 'Search in both Italian and English. Try Italian news sites.' :
                       '';

  const blockedNote = blockedDomains.length > 0
    ? `\n\nDo NOT include sources from: ${blockedDomains.join(', ')}`
    : '';

  // Dense urban cities where most people walk, bike, or use transit
  const denseUrbanCities = ['New York', 'London', 'Paris', 'Stockholm', 'Amsterdam', 'Chicago', 'Singapore', 'Tokyo', 'Sydney', 'Dublin', 'San Francisco', 'Washington DC', 'Cape Town'];
  const isDenseUrban = denseUrbanCities.some(c => city.toLowerCase().includes(c.toLowerCase()));
  const urbanContextNote = isDenseUrban
    ? `\n\nURBAN CONTEXT: ${city} is a dense, walkable city. Most residents walk, bike, or use public transit. Do NOT reference driving, parking, or cars unless the story is specifically about traffic policy, road closures, or transit infrastructure. Never assume readers drive.`
    : '';

  const articleType = options?.articleType || 'daily_brief';

  // System instruction varies by article type
  const basePersona = `You are a well-travelled, successful 35-year-old who has lived in ${neighborhoodName}, ${city} for years. You know every corner of the neighborhood - the hidden gems, the local drama, the new openings before anyone else does.

CRITICAL CONTEXT - CURRENT TIME: It is currently ${contextTimeStr}. When you refer to "today", "tomorrow", "this week", etc., use this timestamp as your reference point. This is when readers will see your update.

IMPORTANT: Your response will be published directly to readers in a neighborhood newsletter. You are NOT responding to the person who submitted this query - you are writing content for third-party readers who live in ${neighborhoodName}.`;

  const dailyBriefStyle = `
Your writing style:
- Knowledgeable but not pretentious
- Deadpan humor when appropriate
- You drop specific details that only a local would know (exact addresses, which corner, who owns what)
- You present information conversationally, like telling a friend what's happening in the neighborhood
- Start with a brief, casual intro greeting. ALWAYS use "Good morning" (never "Good evening" or "Good afternoon") because briefs are delivered in the morning
- End with a brief, friendly sign-off
- CRITICAL: This is a DAILY update published every morning. Never use "another week", "this week's roundup", or any weekly/monthly framing. Treat each brief as today's news.
- CRITICAL: If you cannot verify something with a source, DO NOT mention it at all. Only include stories you can confirm.
- Never say "you mentioned" or correct the query - just write about what IS happening
- ALWAYS write in English. You may sprinkle in local language terms naturally (Swedish greetings like "God morgon", French venue names, etc.) but all prose and section headers MUST be in English.

TONE AND VOCABULARY:
- Do NOT use lowbrow or overly casual words like "ya", "folks", "eats", "grub", "spot" (for restaurant)
- Use "food" instead of "eats", use "you" instead of "ya", use "people" or "locals" instead of "folks"
- NEVER use em dashes (\u2014). Use commas, periods, or hyphens (-) instead.
- The reader is well-educated and prefers polished language without slang
- The final sentence or paragraph must NOT be a question or seek a response from the reader
- End with a statement, not an invitation for feedback or engagement

You're the neighbor everyone wishes they had - always in the know, never boring.`;

  const weeklyRecapStyle = `
Your writing style:
- Professional and informative local journalism
- CRITICAL: NO intro paragraph, NO greeting, NO small talk - jump DIRECTLY into the first news section
- CRITICAL: NO outro paragraph, NO sign-off - end with the last piece of news content
- Knowledgeable and authoritative
- You drop specific details that only a local would know (exact addresses, which corner, who owns what)
- CRITICAL: If you cannot verify something with a source, DO NOT mention it at all. Only include stories you can confirm.
- Never say "you mentioned" or correct the query - just write about what IS happening
- ALWAYS write in English. You may sprinkle in local language terms naturally (Swedish greetings, French venue names, etc.) but all prose and section headers MUST be in English.

TONE AND VOCABULARY:
- Do NOT use lowbrow or overly casual words like "ya", "folks", "eats", "grub", "spot" (for restaurant)
- Use "food" instead of "eats", use "you" instead of "ya", use "people" or "locals" instead of "folks"
- NEVER use em dashes (\u2014). Use commas, periods, or hyphens (-) instead.
- The reader is well-educated and prefers polished language without slang

This is a weekly community recap - straight news, no fluff.`;

  const systemInstruction = basePersona + (articleType === 'weekly_recap' ? weeklyRecapStyle : dailyBriefStyle);

  console.log(`Enriching brief for ${neighborhoodName} using Gemini...`);

  const prompt = `Here are some tips about what might be happening in ${neighborhoodName}, ${city}. Research each one and write a neighborhood update for our readers.

${briefContent}
${blockedNote}${urbanContextNote}

${languageHint}

IMPORTANT RULES:
1. ONLY include stories you can verify with a real source (news article, official site, local blog)
2. If you cannot find a source for something, LEAVE IT OUT completely - do not mention it
3. Do not reference or correct the input - write as if you discovered this news yourself
4. For verified stories, include specific local details:
   - Exact addresses ("Sturegatan 17", "corner of Sibyllegatan and Valhallavägen")
   - Real dates and times
   - The actual business/project names
   - Any backstory or context

FORMATTING RULES:
- Organize your update into sections with creative, punchy section headers
- IMPORTANT: Wrap each section header in double brackets like this: [[Section Header Here]]
- Section headers should be catchy and conversational (e.g., "[[The Bagel Wars Begin]]", "[[Lunch Spot of the Week]]")
- Do NOT use markdown headers (#) or bold (**) - only use [[double brackets]] for headers

Write it like you're the neighborhood insider sharing what's actually happening - conversational but factual. This will be published directly to readers.

After your prose, include this JSON with ONLY the verified stories:
\`\`\`json
{
  "categories": [
    {
      "name": "Category Name",
      "stories": [
        {
          "entity": "Entity Name (key detail)",
          "source": {"name": "Source Name", "url": "https://..."},
          "context": "Your insider context here..."
        }
      ]
    }
  ],
  "link_candidates": [
    {"text": "Exact phrase from your prose"}
  ]
}
\`\`\`

LINK CANDIDATES RULES:
- Include 3-6 key entities worth hyperlinking from your prose
- Use the EXACT text as it appears in your prose (case-sensitive matching)
- Prioritize: business names, venue names, notable people, referenced articles
- Only include entities that readers would want to learn more about`;

  try {
    // Use gemini-2.5-pro with Google Search grounding (gemini-3-pro-preview quota is 0)
    const modelId = 'gemini-2.5-pro';

    // Retry with exponential backoff on quota errors (429 RESOURCE_EXHAUSTED)
    const RETRY_DELAYS = [2000, 5000, 15000]; // 2s, 5s, 15s
    let response;
    let lastError: unknown;

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        response = await genAI.models.generateContent({
          model: modelId,
          contents: `${systemInstruction}\n\n${prompt}`,
          config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.6,
          },
        });
        break; // Success - exit retry loop
      } catch (err: unknown) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        const isQuotaError = errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429');

        if (!isQuotaError || attempt >= RETRY_DELAYS.length) {
          throw err; // Non-quota error or exhausted retries
        }

        console.warn(`Gemini quota hit (attempt ${attempt + 1}/${RETRY_DELAYS.length + 1}), retrying in ${RETRY_DELAYS[attempt]}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
      }
    }

    if (!response) {
      throw lastError || new Error('Gemini enrichment failed after retries');
    }

    const rawText = response.text || '';

    // Strip markdown and JSON from response for clean prose display
    // But preserve [[section headers]] which we explicitly asked for
    let text = rawText
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** -> bold
      .replace(/\*([^*]+)\*/g, '$1')       // *italic* -> italic
      .replace(/```json[\s\S]*?```/g, '')  // Remove JSON code blocks
      .replace(/```[\s\S]*?```/g, '')      // Remove other code blocks
      .replace(/\[([^\]]+)\]\(([^()]*(?:\([^()]*\))*[^()]*)\)/g, '$1')  // [link](url) -> link (handles nested parens in URLs)
      .replace(/^#+\s+/gm, '')             // Remove heading markers
      .replace(/\{\s*"?categories"?[\s\S]*$/i, '')  // Remove trailing JSON
      .replace(/\{\s*categories[\s\S]*$/i, '')     // Remove unquoted JSON variant
      // Clean Gemini Google Search grounding citation artifacts
      .replace(/\.\(/g, '.')               // .( -> . (citation artifact, never valid English)
      .replace(/\.\s*\(\d+\)/g, '.')       // . (1) or .(2) -> . (numbered citations)
      .replace(/\s*\(\d+\)/g, '')          // inline (1) (2) citation numbers
      .replace(/\(\s*\)/g, '')             // () empty parens
      .replace(/\(\s*$/gm, '')             // Orphaned ( at end of line
      // Replace em dashes with hyphens (em dashes look AI-generated)
      .replace(/\u2014/g, ' - ')           // — (em dash) -> space-hyphen-space
      .replace(/\u2013/g, '-')             // – (en dash) -> hyphen
      .replace(/\n{3,}/g, '\n\n')          // Collapse multiple newlines
      .trim();

    console.log('Gemini response length:', text.length);

    // Extract JSON from original response (before markdown stripping)
    let enrichedData: { categories: EnrichedCategory[]; link_candidates?: unknown[] } = { categories: [] };
    let linkCandidates: LinkCandidate[] = [];

    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        if (parsed.categories) {
          enrichedData = parsed;
          console.log('Parsed JSON from Gemini response');
        }
        // Extract and validate link candidates
        if (parsed.link_candidates) {
          linkCandidates = validateLinkCandidates(parsed.link_candidates);
          console.log(`Found ${linkCandidates.length} valid link candidates`);
        }
      } catch (e) {
        console.error('Failed to parse Gemini JSON:', e);
      }
    }

    // If no JSON found, try to extract structured data from the natural response
    if (enrichedData.categories.length === 0) {
      console.log('No JSON found, returning raw response for manual review');

      // Hyperlink injection disabled - made articles look cluttered
      // if (linkCandidates.length > 0 && text) {
      //   text = injectHyperlinks(text, linkCandidates, { name: neighborhoodName, city });
      // }

      // Return raw response for debugging
      return {
        date: dateStr,
        neighborhood: neighborhoodName,
        categories: [],
        processedAt: new Date().toISOString(),
        model: modelId,
        blockedDomains,
        rawResponse: text,
        linkCandidates,
      };
    }

    // Post-process: filter blocked domains and add fallback URLs
    for (const category of enrichedData.categories) {
      for (const story of category.stories) {
        // Filter blocked domains
        if (story.source?.url && blockedDomains.some(d => story.source!.url.toLowerCase().includes(d))) {
          story.source = null;
          story.context = `[Source excluded] ${story.context}`;
        }

        // Add Google fallback
        const searchQuery = `${neighborhoodName} ${story.entity.replace(/\s*\([^)]*\)/, '')}`;
        story.googleFallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
      }
    }

    // Hyperlink injection disabled - made articles look cluttered
    // if (linkCandidates.length > 0 && text) {
    //   text = injectHyperlinks(text, linkCandidates, { name: neighborhoodName, city });
    // }

    return {
      date: dateStr,
      neighborhood: neighborhoodName,
      categories: enrichedData.categories,
      processedAt: new Date().toISOString(),
      model: modelId,
      blockedDomains,
      rawResponse: text,
      linkCandidates,
    };

  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}

/**
 * Format enriched brief as markdown
 */
export function formatGeminiEnrichedBriefAsMarkdown(brief: EnrichedBriefOutput): string {
  // If we have raw response but no parsed categories, return the raw response
  if (brief.categories.length === 0 && brief.rawResponse) {
    return brief.rawResponse;
  }

  let md = `Based on the news happening in ${brief.neighborhood} around **${brief.date}**, here are the source links for those stories`;

  if (brief.blockedDomains.length > 0) {
    md += ` (excluding *${brief.blockedDomains.join(', ')}*)`;
  }
  md += ':\n\n';

  for (const category of brief.categories) {
    md += `### **${category.name}**\n\n`;

    for (const story of category.stories) {
      md += `* **${story.entity}**\n`;

      if (story.source) {
        md += `  * *Source:* **[${story.source.name}](${story.source.url})**\n`;
      } else {
        md += `  * *Source:* [Search Google](${story.googleFallbackUrl})\n`;
      }

      md += `  * *Context:* ${story.context}\n`;

      if (story.note) {
        md += `  * *Note:* ${story.note}\n`;
      }

      if (story.secondarySource) {
        md += `  * *Also:* **[${story.secondarySource.name}](${story.secondarySource.url})**\n`;
      }

      md += '\n';
    }
  }

  return md;
}
