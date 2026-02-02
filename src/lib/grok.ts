/**
 * Grok API Integration
 * Uses xAI's Responses API with X Search for real-time local news
 *
 * Pricing (as of 2026):
 * - grok-4-1-fast: $0.20/1M input, $0.50/1M output
 * - X Search tool: $5 per 1,000 calls ($0.005/call)
 * - Web Search tool: $5 per 1,000 calls
 */

const GROK_API_URL = 'https://api.x.ai/v1';
const GROK_MODEL = 'grok-4-1-fast'; // Best for tool calling

interface XSearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  author?: string;
  published_at?: string;
}

interface GrokResponsesOutput {
  type: 'message';
  role: 'assistant';
  content: string;
}

interface GrokResponsesResponse {
  id: string;
  output: GrokResponsesOutput[];
  citations?: {
    title?: string;
    url?: string;
  }[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface NeighborhoodBrief {
  headline: string;
  content: string;
  sources: XSearchResult[];
  sourceCount: number;
  model: string;
  searchQuery: string;
}

interface GrokNewsStory {
  headline: string;
  body: string;
  previewText: string;
  sources: XSearchResult[];
  category: string;
}

/**
 * Generate a neighborhood brief using Grok Responses API with X Search
 */
export async function generateNeighborhoodBrief(
  neighborhoodName: string,
  city: string,
  country?: string
): Promise<NeighborhoodBrief | null> {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

  if (!apiKey) {
    console.error('Grok API key not configured (GROK_API_KEY or XAI_API_KEY)');
    return null;
  }

  const location = country ? `${neighborhoodName}, ${city}, ${country}` : `${neighborhoodName}, ${city}`;
  const searchQuery = `What is happening in ${location} today? Local news, events, restaurant openings, community happenings.`;

  try {
    // Use the Responses API with built-in search tools
    const response = await fetch(`${GROK_API_URL}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        input: [
          {
            role: 'system',
            content: `You are a witty local neighborhood reporter for Flaneur, covering hyperlocal news. Write in a conversational, engaging style.

Search X and the web for recent posts and news about ${location}. Focus on:
- Restaurant/bar/cafe openings or closings
- Local events happening today or this week
- Community news and developments
- Interesting local sightings
- Real estate and development news

After searching, create a brief "What's Happening Today" summary.

Format your response EXACTLY as:
HEADLINE: [Catchy 5-10 word headline]
CONTENT: [2-3 paragraph summary of what you found]

If you don't find much, acknowledge it charmingly. Be specific with venue names and locations.`
          },
          {
            role: 'user',
            content: searchQuery
          }
        ],
        tools: [
          { type: 'x_search' },
          { type: 'web_search' }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Grok Responses API failed:', response.status, error);
      throw new Error(`Grok API ${response.status}: ${error.slice(0, 200)}`);
    }

    const data: GrokResponsesResponse = await response.json();

    // Extract the assistant's response
    const assistantOutput = data.output?.find(o => o.type === 'message' && o.role === 'assistant');
    const responseText = assistantOutput?.content || '';

    if (!responseText) {
      throw new Error('No response content from Grok');
    }

    // Parse the response
    const headlineMatch = responseText.match(/HEADLINE:\s*(.+?)(?:\n|CONTENT:)/i);
    const contentMatch = responseText.match(/CONTENT:\s*([\s\S]+)/i);

    const headline = headlineMatch?.[1]?.trim() || `What's Happening in ${neighborhoodName}`;
    const content = contentMatch?.[1]?.trim() || responseText;

    // Extract citations/sources
    const sources: XSearchResult[] = (data.citations || []).map(c => ({
      title: c.title,
      url: c.url,
    }));

    return {
      headline,
      content,
      sources,
      sourceCount: sources.length,
      model: GROK_MODEL,
      searchQuery,
    };
  } catch (error) {
    console.error('Grok API error:', error);
    throw error;
  }
}

/**
 * Generate news stories for a neighborhood using Grok Responses API
 * Used as fallback when RSS feeds don't have enough content
 */
export async function generateGrokNewsStories(
  neighborhoodName: string,
  city: string,
  country: string | undefined,
  count: number = 5
): Promise<GrokNewsStory[]> {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

  if (!apiKey) {
    console.error('Grok API key not configured');
    return [];
  }

  const location = country ? `${neighborhoodName}, ${city}, ${country}` : `${neighborhoodName}, ${city}`;

  try {
    const response = await fetch(`${GROK_API_URL}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        input: [
          {
            role: 'system',
            content: `You are a hyperlocal news reporter for Flaneur covering ${location}. Search X and the web for recent posts about this neighborhood and identify newsworthy stories.

Focus on:
- Restaurant/bar/cafe openings, closings, or changes
- Local events and happenings
- Community news and developments
- Interesting local sightings or discoveries
- Real estate and development news
- Local business news

Avoid:
- National/international politics
- Generic content not specific to the neighborhood
- Old news (focus on last 24-48 hours)
- Rumors without substance`
          },
          {
            role: 'user',
            content: `Search for recent news and posts about ${location}. Find ${count} distinct newsworthy stories from the last 24-48 hours.

For each story, provide:
1. HEADLINE: Engaging headline (under 80 chars)
2. CATEGORY: One of [opening, closing, event, community, sighting, development, business]
3. PREVIEW: 1-2 sentence teaser
4. BODY: 2-3 paragraph article (150-250 words)

Format each story clearly separated by "---"`
          }
        ],
        tools: [
          { type: 'x_search' },
          { type: 'web_search' }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Grok news generation failed:', response.status, error);
      return [];
    }

    const data: GrokResponsesResponse = await response.json();

    const assistantOutput = data.output?.find(o => o.type === 'message' && o.role === 'assistant');
    const content = assistantOutput?.content || '';

    // Parse stories from response
    const stories: GrokNewsStory[] = [];
    const storyBlocks = content.split('---').filter(block => block.trim());

    for (const block of storyBlocks) {
      const headlineMatch = block.match(/HEADLINE:\s*(.+?)(?:\n|$)/i);
      const categoryMatch = block.match(/CATEGORY:\s*(.+?)(?:\n|$)/i);
      const previewMatch = block.match(/PREVIEW:\s*([\s\S]+?)(?:\n|BODY:)/i);
      const bodyMatch = block.match(/BODY:\s*([\s\S]+?)(?:---|$)/i);

      if (headlineMatch && bodyMatch) {
        stories.push({
          headline: headlineMatch[1].trim(),
          category: categoryMatch?.[1]?.trim().toLowerCase() || 'community',
          previewText: previewMatch?.[1]?.trim() || '',
          body: bodyMatch[1].trim(),
          sources: [],
        });
      }
    }

    return stories.slice(0, count);
  } catch (error) {
    console.error('Grok news generation error:', error);
    return [];
  }
}

/**
 * Check if Grok API is configured and available
 */
export function isGrokConfigured(): boolean {
  return !!(process.env.GROK_API_KEY || process.env.XAI_API_KEY);
}
