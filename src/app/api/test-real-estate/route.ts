import { NextResponse } from 'next/server';

const GROK_API_URL = 'https://api.x.ai/v1';
const GROK_MODEL = 'grok-4-1-fast';

interface GrokResponse {
  output?: Array<{
    type: string;
    role: string;
    content: string;
  }>;
  citations?: Array<{
    title?: string;
    url?: string;
  }>;
}

async function queryGrok(query: string): Promise<{ content: string; citations: string[] }> {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

  if (!apiKey) {
    throw new Error('GROK_API_KEY not configured');
  }

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
          content: `You are a real estate research assistant. Search X and the web for recent real estate listings, sales, and market news. Be specific with prices, addresses, and sources. If you cannot find specific data, say so clearly.`
        },
        {
          role: 'user',
          content: query
        }
      ],
      tools: [
        { type: 'x_search' },
        { type: 'web_search' }
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Grok API error: ${response.status} - ${error.slice(0, 200)}`);
  }

  const data: GrokResponse = await response.json();

  const assistantOutput = data.output?.find(o => o.type === 'message' && o.role === 'assistant');
  const content = assistantOutput?.content || 'No response';
  const citations = (data.citations || []).map(c => c.url || c.title || '').filter(Boolean);

  return { content, citations };
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
    'listings': `What are the top most expensive apartments in ${searchName} that became available for sale over the past week? Include specific prices and addresses if available.`,
    'sales': `What are the top most expensive apartments in ${searchName} that closed or sold over the past week? Include sale prices and addresses if available.`,
    'trends': `What are the most recent ${searchName} residential real estate market trends? Include any relevant statistics or insights from the past week.`,
  };

  const query = queries[queryType] || queries['listings'];

  try {
    const result = await queryGrok(query);
    return NextResponse.json({
      neighborhood: searchName,
      queryType,
      query,
      ...result
    }, { status: 200 });
  } catch (e) {
    return NextResponse.json({
      neighborhood: searchName,
      queryType,
      query,
      error: String(e)
    }, { status: 500 });
  }
}
