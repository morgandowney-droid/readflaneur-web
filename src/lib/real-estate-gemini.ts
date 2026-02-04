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

/**
 * Parse a price string like "$3.7M" or "$3,700,000" into a number
 */
function parsePrice(priceStr: string): number | null {
  if (!priceStr || priceStr === 'N/A') return null;

  // Handle millions format: $3.7M, $3.70M
  const millionsMatch = priceStr.match(/\$?([\d.]+)M/i);
  if (millionsMatch) {
    return parseFloat(millionsMatch[1]) * 1_000_000;
  }

  // Handle regular format: $3,700,000
  const regularMatch = priceStr.match(/\$?([\d,]+)/);
  if (regularMatch) {
    return parseFloat(regularMatch[1].replace(/,/g, ''));
  }

  return null;
}

/**
 * Parse a price per sqft string like "$2,150" or "$2.15K" into a number
 */
function parsePricePerSqft(priceStr: string): number | null {
  if (!priceStr || priceStr === 'N/A') return null;

  // Handle thousands format: $2.15K, $2K
  const thousandsMatch = priceStr.match(/\$?([\d.]+)K/i);
  if (thousandsMatch) {
    return parseFloat(thousandsMatch[1]) * 1_000;
  }

  const match = priceStr.match(/\$?([\d,]+)/);
  if (match) {
    return parseFloat(match[1].replace(/,/g, ''));
  }

  return null;
}

/**
 * Calculate Average Property Size from Median Sale Price / Price Per SqFt
 * and insert it into the market data content
 */
function calculateAndInsertAvgSize(content: string): string {
  // Extract median sale price (current and year ago)
  const medianMatch = content.match(/MEDIAN SALE PRICE\s*\n\s*Now:\s*([^\|]+)\|\s*Year Ago:\s*([^\|]+)/i);
  const priceSqftMatch = content.match(/PRICE PER SQ FT\s*\n\s*Now:\s*([^\|]+)\|\s*Year Ago:\s*([^\|]+)/i);

  if (!medianMatch || !priceSqftMatch) {
    return content;
  }

  const medianNow = parsePrice(medianMatch[1].trim());
  const medianYearAgo = parsePrice(medianMatch[2].trim());
  const priceSqftNow = parsePricePerSqft(priceSqftMatch[1].trim());
  const priceSqftYearAgo = parsePricePerSqft(priceSqftMatch[2].trim());

  // Calculate average property sizes
  let avgSizeNow = 'N/A';
  let avgSizeYearAgo = 'N/A';
  let changeStr = 'N/A';

  if (medianNow && priceSqftNow) {
    avgSizeNow = Math.round(medianNow / priceSqftNow).toLocaleString() + ' sq ft';
  }

  if (medianYearAgo && priceSqftYearAgo) {
    avgSizeYearAgo = Math.round(medianYearAgo / priceSqftYearAgo).toLocaleString() + ' sq ft';
  }

  if (medianNow && priceSqftNow && medianYearAgo && priceSqftYearAgo) {
    const sizeNow = medianNow / priceSqftNow;
    const sizeYearAgo = medianYearAgo / priceSqftYearAgo;
    const change = ((sizeNow - sizeYearAgo) / sizeYearAgo) * 100;
    changeStr = (change >= 0 ? '+' : '') + change.toFixed(1) + '%';
  }

  // Insert the AVG PROPERTY SIZE row after PRICE PER SQ FT
  const avgSizeRow = `\nAVG PROPERTY SIZE (calculated)\nNow: ${avgSizeNow} | Year Ago: ${avgSizeYearAgo} | Change: ${changeStr}\n`;

  // Find where to insert (after PRICE PER SQ FT section)
  const insertPoint = content.search(/PRICE PER SQ FT[^\n]*\n[^\n]*\n/i);
  if (insertPoint !== -1) {
    const afterPriceSqft = content.indexOf('\n', content.indexOf('\n', insertPoint) + 1) + 1;
    return content.slice(0, afterPriceSqft) + avgSizeRow + content.slice(afterPriceSqft);
  }

  return content;
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

  const systemPrompt = `Output ONLY the requested data format. NO explanations, NO commentary, NO phrases like "Based on...", "I found...", "Here are...". Start directly with the numbered list or data. If data is unavailable, use "N/A".`;

  // Query 1: Top 5 Listings by Price
  const listingsQuery = `Find the 5 most expensive residential properties currently for sale in ${location}.

Search Zillow, Realtor.com, StreetEasy, Sotheby's, Christie's, Douglas Elliman, Compass.

Sort by asking price (highest first). START YOUR RESPONSE WITH "1." - no introduction.

1. [FULL STREET ADDRESS, CITY, STATE/COUNTRY ZIP]
   $XX,XXX,XXX | X bed, X bath | X,XXX sq ft | $X,XXX/sq ft

2. [FULL STREET ADDRESS]
   $XX,XXX,XXX | X bed, X bath | X,XXX sq ft | $X,XXX/sq ft

List exactly 5 properties. Include only: address, price, beds, baths, sqft, price/sqft. No descriptions.`;

  // Query 2: Top 5 Recent Sales by Price
  const salesQuery = `Find recent residential sales that CLOSED in ${location} in the past 30-60 days. Prioritize the most expensive sales, but if you cannot find the top 5 most expensive, provide any recent sales you can find.

START YOUR RESPONSE WITH "1." - no introduction. No explanations about what you could or couldn't find.

1. [FULL STREET ADDRESS, CITY, STATE/COUNTRY ZIP]
   $XX,XXX,XXX | X bed, X bath | X,XXX sq ft | $X,XXX/sq ft
   Closed [MM/DD/YYYY].

2. [FULL STREET ADDRESS]
   ...

List up to 5 sales with addresses, sale prices, price/sqft, and close dates. If fewer than 5 are available, list what you can find.`;

  // Query 3: Market Data
  const trendsQuery = `Find current real estate market statistics for ${location} with year-over-year comparisons.

START YOUR RESPONSE WITH "MEDIAN SALE PRICE" - no introduction.

MEDIAN SALE PRICE
Now: $X.XXM | Year Ago: $X.XXM | Change: +X%

PRICE PER SQ FT
Now: $X,XXX | Year Ago: $X,XXX | Change: +X%

ACTIVE INVENTORY
Now: XXX | Year Ago: XXX | Change: +X%

AVG DAYS ON MARKET
Now: XX days | Year Ago: XX days | Change: +X days

Use N/A if data unavailable. No other text.`;

  // Execute all queries
  const [listingsResult, salesResult, trendsResult] = await Promise.all([
    queryGemini(listingsQuery, systemPrompt),
    queryGemini(salesQuery, systemPrompt),
    queryGemini(trendsQuery, systemPrompt),
  ]);

  // Clean up intro text that Gemini sometimes adds
  const cleanupIntroText = (content: string, location: string): string => {
    // Replace "Based on the search results, here are X..." with simpler intro
    let cleaned = content.replace(
      /Based on (?:the )?search results,?\s*here are \d+ of the most expensive/gi,
      'Some of the most expensive'
    );
    // Remove other common intro phrases
    cleaned = cleaned.replace(/^(?:Here are |I found |Based on my search,?\s*)/gim, '');
    // Remove "I am unable to find..." error messages and follow-up offers
    cleaned = cleaned.replace(/I am unable to find[^.]*\.\s*/gi, '');
    cleaned = cleaned.replace(/I (?:can|could) (?:not|n't) find[^.]*\.\s*/gi, '');
    cleaned = cleaned.replace(/I can provide some recent[^.]*\.\s*/gi, '');
    cleaned = cleaned.replace(/(?:but )?not the top \d+ most expensive[^.]*\.\s*/gi, '');
    return cleaned.trim();
  };

  const cleanedListings = cleanupIntroText(listingsResult.content, location);
  const cleanedSales = cleanupIntroText(salesResult.content, location);

  // Calculate and insert Average Property Size from Median Price / Price Per SqFt
  const processedTrends = calculateAndInsertAvgSize(trendsResult.content);

  // Generate headline
  const headline = `${neighborhoodName} Real Estate: This Week's Top Listings & Sales`;

  return {
    neighborhood: neighborhoodName,
    neighborhoodId,
    headline,
    listings: {
      title: 'Top Listings',
      content: cleanedListings,
      sources: listingsResult.sources,
    },
    sales: {
      title: 'Top Recent Sales',
      content: cleanedSales,
      sources: salesResult.sources,
    },
    trends: {
      title: 'Real Estate Market Data',
      content: processedTrends,
      sources: trendsResult.sources,
    },
    generatedAt: new Date().toISOString(),
  };
}

function addGoogleSearchLinks(content: string): string {
  // Match numbered lines that start with "1. [ADDRESS]" or "1. 123 Main St"
  const lines = content.split('\n');
  const processedLines = lines.map(line => {
    // Match "1. [ADDRESS]" format (with brackets)
    const bracketMatch = line.match(/^(\d+\.)\s*\[([^\]]+)\]/);
    if (bracketMatch) {
      const number = bracketMatch[1];
      const address = bracketMatch[2].trim();
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(address + ' real estate')}`;
      // Add two spaces at end for markdown line break
      return `${number} [**${address}**](${searchUrl})  `;
    }

    // Match "1. 123 Main St, City" format (address on first line after number)
    const addressMatch = line.match(/^(\d+\.)\s*([^$|*\n]+?)$/);
    if (addressMatch) {
      const number = addressMatch[1];
      const address = addressMatch[2].trim();
      // Check if it looks like an address (has a number and reasonable length)
      if (address.length > 10 && /\d/.test(address) && /[A-Za-z]/.test(address)) {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(address + ' real estate')}`;
        // Add two spaces at end for markdown line break
        return `${number} [**${address}**](${searchUrl})  `;
      }
    }
    return line;
  });
  return processedLines.join('\n');
}

export function formatRealEstateArticle(result: RealEstateWeeklyResult): string {
  const parts: string[] = [];

  // Listings section - add Google search links
  const listingsWithLinks = addGoogleSearchLinks(result.listings.content);
  parts.push(`**${result.listings.title}**\n\n${listingsWithLinks}`);

  // Sales section - add Google search links
  const salesWithLinks = addGoogleSearchLinks(result.sales.content);
  parts.push(`**${result.sales.title}**\n\n${salesWithLinks}`);

  // Market Data section (no links needed)
  parts.push(`**${result.trends.title}**\n\n${result.trends.content}`);

  return parts.join('\n\n');
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
