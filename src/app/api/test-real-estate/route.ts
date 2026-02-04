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

  // Simple auth check
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const neighborhoods = [
    { name: 'Tribeca', searchName: 'Tribeca, New York City' },
    { name: 'Östermalm', searchName: 'Östermalm, Stockholm, Sweden' },
    { name: 'The Hamptons', searchName: 'The Hamptons and Montauk, New York' },
  ];

  const results: Record<string, {
    newListings: { content: string; citations: string[] } | { error: string };
    recentSales: { content: string; citations: string[] } | { error: string };
    marketTrends: { content: string; citations: string[] } | { error: string };
  }> = {};

  for (const neighborhood of neighborhoods) {
    results[neighborhood.name] = {
      newListings: { content: '', citations: [] },
      recentSales: { content: '', citations: [] },
      marketTrends: { content: '', citations: [] },
    };

    // Query 1: New Listings
    try {
      results[neighborhood.name].newListings = await queryGrok(
        `What are the top most expensive apartments in ${neighborhood.searchName} that became available for sale over the past week? Include specific prices and addresses if available.`
      );
    } catch (e) {
      results[neighborhood.name].newListings = { error: String(e) };
    }

    // Query 2: Recent Sales
    try {
      results[neighborhood.name].recentSales = await queryGrok(
        `What are the top most expensive apartments in ${neighborhood.searchName} that closed or sold over the past week? Include sale prices and addresses if available.`
      );
    } catch (e) {
      results[neighborhood.name].recentSales = { error: String(e) };
    }

    // Query 3: Market Trends
    try {
      results[neighborhood.name].marketTrends = await queryGrok(
        `What are the most recent ${neighborhood.searchName} residential real estate market trends? Include any relevant statistics or insights from the past week.`
      );
    } catch (e) {
      results[neighborhood.name].marketTrends = { error: String(e) };
    }
  }

  return NextResponse.json(results, { status: 200 });
}
