/**
 * Grok API Integration
 * Uses xAI's Grok models with X Search for real-time local news
 *
 * Pricing (as of 2026):
 * - grok-4.1-fast: $0.20/1M input, $0.50/1M output
 * - X Search tool: $5 per 1,000 calls ($0.005/call)
 */

const GROK_API_URL = 'https://api.x.ai/v1';
const GROK_MODEL = 'grok-4.1-fast';

interface GrokMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface XSearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  author?: string;
  published_at?: string;
}

interface GrokResponse {
  id: string;
  choices: {
    message: {
      content: string;
      tool_calls?: {
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }[];
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
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
 * Generate a neighborhood brief using Grok with X Search
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
  const searchQuery = `what is happening in ${location} today`;

  try {
    // Step 1: Use X Search to get real-time posts about the neighborhood
    const searchResponse = await fetch(`${GROK_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a local news assistant. Search for recent posts and news about ${location}. Focus on: local events, restaurant/bar openings, community happenings, interesting sightings, and neighborhood news. Exclude national politics and generic content.`
          },
          {
            role: 'user',
            content: searchQuery
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'x_search',
              description: 'Search X (Twitter) for real-time posts',
              parameters: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'The search query'
                  }
                },
                required: ['query']
              }
            }
          }
        ],
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!searchResponse.ok) {
      const error = await searchResponse.text();
      console.error('Grok X Search failed:', error);
      return null;
    }

    const searchData: GrokResponse = await searchResponse.json();

    // Step 2: Generate the brief summary
    const summaryResponse = await fetch(`${GROK_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a witty local neighborhood reporter for Flaneur, an app that covers hyperlocal neighborhood news. Write in a conversational, engaging style - like a well-informed friend telling you what's happening.

Your task: Create a brief "What's Happening Today" summary for ${location}.

Guidelines:
- Lead with the most interesting/timely item
- Be specific about places, events, people
- Keep it to 2-3 short paragraphs
- Include specific venue names when mentioned
- Add personality but stay informative
- If there's not much happening, acknowledge it with charm

Output format:
HEADLINE: [Catchy 5-10 word headline]
CONTENT: [2-3 paragraph summary]`
          },
          {
            role: 'assistant',
            content: searchData.choices[0]?.message?.content || 'No recent posts found.'
          },
          {
            role: 'user',
            content: `Based on what you found, write the neighborhood brief for ${location}. If you didn't find much, say so honestly but charmingly.`
          }
        ],
        temperature: 0.8,
        max_tokens: 1000,
      }),
    });

    if (!summaryResponse.ok) {
      const error = await summaryResponse.text();
      console.error('Grok summary generation failed:', error);
      return null;
    }

    const summaryData: GrokResponse = await summaryResponse.json();
    const responseText = summaryData.choices[0]?.message?.content || '';

    // Parse the response
    const headlineMatch = responseText.match(/HEADLINE:\s*(.+?)(?:\n|CONTENT:)/i);
    const contentMatch = responseText.match(/CONTENT:\s*([\s\S]+)/i);

    const headline = headlineMatch?.[1]?.trim() || `What's Happening in ${neighborhoodName}`;
    const content = contentMatch?.[1]?.trim() || responseText;

    return {
      headline,
      content,
      sources: [], // X Search results are embedded in the response
      sourceCount: 0,
      model: GROK_MODEL,
      searchQuery,
    };
  } catch (error) {
    console.error('Grok API error:', error);
    return null;
  }
}

/**
 * Generate news stories for a neighborhood using Grok X Search
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
    const response = await fetch(`${GROK_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a hyperlocal news reporter for Flaneur covering ${location}. Search X for recent posts about this neighborhood and identify newsworthy stories.

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
          {
            type: 'function',
            function: {
              name: 'x_search',
              description: 'Search X (Twitter) for real-time posts about the neighborhood',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string' }
                },
                required: ['query']
              }
            }
          }
        ],
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Grok news generation failed:', error);
      return [];
    }

    const data: GrokResponse = await response.json();
    const content = data.choices[0]?.message?.content || '';

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
