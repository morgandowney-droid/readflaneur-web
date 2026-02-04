/**
 * Real Estate Weekly Generator using Gemini with Google Search
 * Generates weekly real estate reports for neighborhoods
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: {
          uri?: string;
          title?: string;
        };
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface RealEstateSection {
  title: string;
  content: string;
  sources: string[];
}

interface RealEstateWeeklyResult {
  neighborhood: string;
  neighborhoodId: string;
  headline: string;
  listings: RealEstateSection;
  sales: RealEstateSection;
  trends: RealEstateSection;
  generatedAt: string;
}

async function queryGemini(query: string, systemPrompt: string): Promise<{ content: string; sources: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: query }]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      tools: [{
        googleSearch: {}
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      }
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error.slice(0, 300)}`);
  }

  const data: GeminiResponse = await response.json();

  if (data.error) {
    throw new Error(`Gemini error: ${data.error.message}`);
  }

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const sources = (data.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
    .map(chunk => chunk.web?.uri || '')
    .filter(Boolean)
    .slice(0, 5); // Limit to 5 sources

  return { content, sources };
}

function getSearchLocation(neighborhoodName: string, city: string, country: string): string {
  // Special expansions for certain neighborhoods
  const expansions: Record<string, string> = {
    'The Hamptons': 'The Hamptons, East Hampton, Southampton, Sag Harbor, and Montauk, New York',
    'Nantucket': 'Nantucket Island, Massachusetts',
    "Martha's Vineyard": "Martha's Vineyard, Massachusetts",
  };

  if (expansions[neighborhoodName]) {
    return expansions[neighborhoodName];
  }

  return `${neighborhoodName}, ${city}, ${country}`;
}

export async function generateRealEstateWeekly(
  neighborhoodId: string,
  neighborhoodName: string,
  city: string,
  country: string
): Promise<RealEstateWeeklyResult> {
  const location = getSearchLocation(neighborhoodName, city, country);

  const systemPrompt = `You are a luxury real estate journalist writing for Flâneur, an upscale neighborhood news platform. Write in a sophisticated, informative style. Be specific with addresses, prices, and details. Format prices appropriately for the local currency. If you cannot find specific recent data, acknowledge this gracefully and provide the best available information.`;

  // Query 1: Top 5 Listings by Price
  const listingsQuery = `Search for the top 5 most expensive residential properties (houses, apartments, condos) currently listed for sale in ${location}.

For each property, provide:
- Full address
- Asking price
- Key features (bedrooms, bathrooms, square footage if available)
- Listing agency if known

Format as a numbered list. Focus on the highest priced listings available right now.`;

  // Query 2: Top 5 Recent Sales by Price
  const salesQuery = `Search for the top 5 most expensive residential property sales that closed in ${location} in the past 30 days.

For each sale, provide:
- Full address
- Sale price
- Key details (bedrooms, bathrooms, square footage if available)
- Date sold if known

Format as a numbered list. Focus on the highest priced closed sales.`;

  // Query 3: Market Trends
  const trendsQuery = `Search for the latest residential real estate market trends and statistics for ${location}.

Include:
- Current median/average home prices
- Price trends (up/down compared to last year)
- Inventory levels and days on market
- Any notable market developments or news
- Outlook for the coming months

Write 2-3 paragraphs summarizing the current market conditions.`;

  // Execute all queries
  const [listingsResult, salesResult, trendsResult] = await Promise.all([
    queryGemini(listingsQuery, systemPrompt),
    queryGemini(salesQuery, systemPrompt),
    queryGemini(trendsQuery, systemPrompt),
  ]);

  // Generate headline
  const headline = `${neighborhoodName} Real Estate: This Week's Top Listings & Sales`;

  return {
    neighborhood: neighborhoodName,
    neighborhoodId,
    headline,
    listings: {
      title: 'Top 5 Listings by Price',
      content: listingsResult.content,
      sources: listingsResult.sources,
    },
    sales: {
      title: 'Top 5 Recent Sales',
      content: salesResult.content,
      sources: salesResult.sources,
    },
    trends: {
      title: 'Market Trends',
      content: trendsResult.content,
      sources: trendsResult.sources,
    },
    generatedAt: new Date().toISOString(),
  };
}

export function formatRealEstateArticle(result: RealEstateWeeklyResult): string {
  const parts: string[] = [];

  // Listings section
  parts.push(`## ${result.listings.title}\n\n${result.listings.content}`);

  // Sales section
  parts.push(`## ${result.sales.title}\n\n${result.sales.content}`);

  // Trends section
  parts.push(`## ${result.trends.title}\n\n${result.trends.content}`);

  return parts.join('\n\n---\n\n');
}

export function collectAllSources(result: RealEstateWeeklyResult): string[] {
  const allSources = [
    ...result.listings.sources,
    ...result.sales.sources,
    ...result.trends.sources,
  ];
  // Deduplicate
  return [...new Set(allSources)];
}
