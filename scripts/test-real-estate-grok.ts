/**
 * Test Grok API for real estate queries
 * Run: npx tsx scripts/test-real-estate-grok.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

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
    throw new Error('GROK_API_KEY or XAI_API_KEY not set');
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
    throw new Error(`Grok API error: ${response.status} - ${error}`);
  }

  const data: GrokResponse = await response.json();

  const assistantOutput = data.output?.find(o => o.type === 'message' && o.role === 'assistant');
  const content = assistantOutput?.content || 'No response';
  const citations = (data.citations || []).map(c => c.url || c.title || '').filter(Boolean);

  return { content, citations };
}

async function testNeighborhood(name: string, searchName: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TESTING: ${name}`);
  console.log(`${'='.repeat(60)}`);

  const queries = [
    `What are the top most expensive apartments in ${searchName} that became available for sale over the past week? Include specific prices and addresses if available.`,
    `What are the top most expensive apartments in ${searchName} that closed or sold over the past week? Include sale prices and addresses if available.`,
    `What are the most recent ${searchName} residential real estate market trends? Include any relevant statistics or insights from the past week.`
  ];

  const labels = [
    '1. NEW LISTINGS (Past Week)',
    '2. RECENT SALES/CLOSINGS (Past Week)',
    '3. MARKET TRENDS'
  ];

  for (let i = 0; i < queries.length; i++) {
    console.log(`\n--- ${labels[i]} ---`);
    console.log(`Query: ${queries[i]}\n`);

    try {
      const result = await queryGrok(queries[i]);
      console.log('Response:');
      console.log(result.content);
      if (result.citations.length > 0) {
        console.log('\nSources:');
        result.citations.forEach(c => console.log(`  - ${c}`));
      }
    } catch (error) {
      console.error('Error:', error);
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function main() {
  console.log('Testing Grok API for Real Estate Queries');
  console.log('=========================================\n');

  const neighborhoods = [
    { name: 'Tribeca', searchName: 'Tribeca, New York City' },
    { name: 'Östermalm', searchName: 'Östermalm, Stockholm, Sweden' },
    { name: 'The Hamptons', searchName: 'The Hamptons and Montauk, New York' },
  ];

  for (const neighborhood of neighborhoods) {
    await testNeighborhood(neighborhood.name, neighborhood.searchName);
  }

  console.log('\n\nDone!');
}

main().catch(console.error);
