import { NextResponse } from 'next/server';

// Extend timeout for Gemini API calls
export const maxDuration = 120;

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
      searchEntryPoint?: {
        renderedContent?: string;
      };
    };
  }>;
  error?: {
    message?: string;
  };
}

async function queryGemini(query: string): Promise<{ content: string; sources: string[] }> {
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
        parts: [{
          text: `You are a real estate research assistant. Search the web for recent real estate listings, sales, and market news. Be specific with prices, addresses, and sources. If you cannot find specific data, say so clearly. Always cite your sources.`
        }]
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

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';

  // Extract sources from grounding metadata
  const sources = (data.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
    .map(chunk => chunk.web?.uri || chunk.web?.title || '')
    .filter(Boolean);

  return { content, sources };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const neighborhood = searchParams.get('neighborhood') || 'tribeca';
  const queryType = searchParams.get('query') || 'listings'; // listings, sales, trends

  // Simple auth check
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const neighborhoodMap: Record<string, string> = {
    'tribeca': 'Tribeca, New York City',
    'ostermalm': 'Östermalm, Stockholm, Sweden',
    'hamptons': 'The Hamptons and Montauk, New York',
  };

  const searchName = neighborhoodMap[neighborhood.toLowerCase()] || neighborhood;

  const queries: Record<string, string> = {
    'listings': `What are the top most expensive apartments in ${searchName} that became available for sale over the past week? Include specific prices and addresses if available. Search for recent real estate listings.`,
    'sales': `What are the top most expensive apartments in ${searchName} that closed or sold over the past week? Include sale prices and addresses if available. Search for recent real estate sales and closings.`,
    'trends': `What are the most recent ${searchName} residential real estate market trends? Include any relevant statistics or insights from the past week. Search for recent market reports and news.`,
  };

  const query = queries[queryType] || queries['listings'];

  try {
    const result = await queryGemini(query);
    return NextResponse.json({
      neighborhood: searchName,
      queryType,
      query,
      model: 'gemini-2.5-flash',
      ...result
    }, { status: 200 });
  } catch (e) {
    return NextResponse.json({
      neighborhood: searchName,
      queryType,
      query,
      model: 'gemini-2.5-flash',
      error: String(e)
    }, { status: 500 });
  }
}
