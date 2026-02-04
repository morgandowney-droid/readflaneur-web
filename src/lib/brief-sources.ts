/**
 * Brief Source Finder
 *
 * Takes a neighborhood brief and finds authoritative source links for each story.
 * Uses Claude with web search to find sources, keeping Google Search as fallback.
 *
 * Only excludes Tribeca Citizen for Tribeca neighborhood - all other sources are fair game.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface StorySource {
  title: string;
  url: string;
  domain: string;
}

export interface EnrichedStory {
  text: string;           // Original story text from the brief
  sources: StorySource[]; // Found authoritative sources
  googleSearchUrl: string; // Fallback Google Search link
  searchQuery: string;     // The query used to find sources
}

export interface EnrichedBrief {
  stories: EnrichedStory[];
  processedAt: string;
  model: string;
}

// Blocked domains per neighborhood (only Tribeca Citizen for Tribeca)
const BLOCKED_DOMAINS: Record<string, string[]> = {
  'tribeca': ['tribecacitizen.com'],
};

/**
 * Parse brief content into individual story items
 * Each sentence or distinct fact becomes a searchable story
 */
export function parseBriefIntoStories(content: string): string[] {
  // Clean content first
  const cleaned = content
    .replace(/\[\[\d+\]\]\([^)]+\)/g, '') // Remove citation markers
    .replace(/https?:\/\/\S+/g, '')        // Remove URLs
    .replace(/\s*—\s*/g, '. ')             // Em dashes to periods
    .replace(/\.\.\s*/g, '. ')             // Fix double periods
    .trim();

  // Split into sentences, keeping reasonable chunks
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20); // Skip very short fragments

  // Group related sentences (if they share key nouns)
  // For now, just return individual sentences
  return sentences;
}

/**
 * Extract the primary entity/business name from a story
 * Handles: "PopUp Bagels opens...", "Jay's Pizza aims...", "Amazon Go at..."
 */
function extractPrimaryEntity(story: string): string | null {
  // Pattern 1: Name at start of sentence (most common)
  // "PopUp Bagels opens..." -> "PopUp Bagels"
  // "Jay's Pizza aims..." -> "Jay's Pizza"
  // "Amazon Go at Brookfield..." -> "Amazon Go"
  const startPatterns = [
    // CamelCase + following words: "PopUp Bagels", "iPhone Store"
    /^([A-Z][a-z]*[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]+)*)/,
    // Possessive names: "Jay's Pizza", "Macy's"
    /^([A-Z][a-z]+[''][a-z]*(?:\s+[A-Z][a-zA-Z]+)*)/,
    // Multi-word capitalized names: "Amazon Go", "City Hall Park"
    /^([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/,
    // Single capitalized word followed by action verb
    /^([A-Z][a-zA-Z]+)(?:\s+(?:opens?|closed?|aims?|plans?|debuts?|pops?))/,
  ];

  for (const pattern of startPatterns) {
    const match = story.match(pattern);
    if (match && match[1].length > 2) {
      return match[1];
    }
  }

  // Pattern 2: Name after comma or "a/an": "Etiq, a gemstone spot" -> "Etiq"
  const afterCommaMatch = story.match(/^([A-Z][a-zA-ZÀ-ÿ]+(?:\s+[A-Z][a-zA-ZÀ-ÿ]+)*),\s+(?:a|an|the)/i);
  if (afterCommaMatch) {
    return afterCommaMatch[1];
  }

  // Pattern 3: Name with special characters: "Enfants Riches Déprimés"
  const accentedMatch = story.match(/^([A-Z][a-zA-ZÀ-ÿ]+(?:\s+[A-Z][a-zA-ZÀ-ÿ]+)*)/);
  if (accentedMatch && accentedMatch[1].length > 3) {
    return accentedMatch[1];
  }

  return null;
}

/**
 * Extract secondary location/venue from story
 * "Amazon Go at Brookfield Place" -> "Brookfield Place"
 */
function extractSecondaryLocation(story: string): string | null {
  const locationPatterns = [
    /\bat\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/,  // "at Brookfield Place"
    /\bon\s+([A-Z][a-zA-Z]+(?:\s+(?:Street|St|Avenue|Ave|Place|Pl))?)/i,  // "on Franklin Street"
    /\bin\s+the\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/,  // "in the Meatpacking District"
  ];

  for (const pattern of locationPatterns) {
    const match = story.match(pattern);
    if (match && match[1].length > 3) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract action keywords that indicate news type
 */
function extractActionKeywords(story: string): string[] {
  const actions: string[] = [];
  const lowerStory = story.toLowerCase();

  if (/opens?|opening|debut/.test(lowerStory)) actions.push('opening');
  if (/closed?|closing|shuttered/.test(lowerStory)) actions.push('closing');
  if (/plans?|planning|announces?/.test(lowerStory)) actions.push('plans');
  if (/pops?\s+up|pop-up|popup|temporary/.test(lowerStory)) actions.push('pop-up');
  if (/flagship/.test(lowerStory)) actions.push('flagship store');
  if (/warehouse|convert|development/.test(lowerStory)) actions.push('development');

  return actions;
}

/**
 * Generate optimized search query for a story
 */
function generateSearchQuery(story: string, neighborhoodName: string, city: string): string {
  const primaryEntity = extractPrimaryEntity(story);
  const secondaryLocation = extractSecondaryLocation(story);
  const actions = extractActionKeywords(story);

  // Build query parts
  const parts: string[] = [];

  // Always include primary entity if found
  if (primaryEntity) {
    parts.push(primaryEntity);
  }

  // Add neighborhood context
  parts.push(neighborhoodName);

  // Add secondary location if different from neighborhood
  if (secondaryLocation && !secondaryLocation.toLowerCase().includes(neighborhoodName.toLowerCase())) {
    parts.push(secondaryLocation);
  }

  // Add most relevant action keyword
  if (actions.length > 0) {
    parts.push(actions[0]);
  }

  // If we couldn't extract much, use first 40 chars cleaned up
  if (parts.length < 2) {
    const cleanedStart = story.slice(0, 40).replace(/[.,!?].*$/, '').trim();
    return `${cleanedStart} ${neighborhoodName} ${city}`;
  }

  return parts.join(' ');
}

/**
 * Generate Google Search fallback URL
 */
function generateGoogleSearchUrl(story: string, neighborhoodName: string): string {
  // Extract the most likely entity name from the story
  const entityMatch = story.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/);
  const entity = entityMatch ? entityMatch[0] : story.slice(0, 30);
  const query = `${neighborhoodName} ${entity}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/**
 * Check if a URL should be blocked for a neighborhood
 */
function isBlockedSource(url: string, neighborhoodSlug: string): boolean {
  const blockedDomains = BLOCKED_DOMAINS[neighborhoodSlug.toLowerCase()] || [];
  return blockedDomains.some(domain => url.toLowerCase().includes(domain));
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Find sources for a single story using Claude with web search
 */
async function findSourcesForStory(
  story: string,
  neighborhoodName: string,
  neighborhoodSlug: string,
  city: string,
  anthropic: Anthropic
): Promise<EnrichedStory> {
  const searchQuery = generateSearchQuery(story, neighborhoodName, city);
  const googleSearchUrl = generateGoogleSearchUrl(story, neighborhoodName);
  const primaryEntity = extractPrimaryEntity(story);
  const fallbackQuery = `${primaryEntity || story.slice(0, 30)} ${city} 2026`;

  const blockedDomains = BLOCKED_DOMAINS[neighborhoodSlug.toLowerCase()] || [];
  const blockedDomainsNote = blockedDomains.length > 0
    ? `\n\nIMPORTANT: Do NOT include any sources from these domains: ${blockedDomains.join(', ')}`
    : '';

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Find authoritative news sources for this local story about ${neighborhoodName}, ${city}:

"${story}"

Search strategy:
1. First search: "${searchQuery}"
2. If no results, try: "${fallbackQuery}"
3. Look for news articles, official announcements, or reputable local blogs

Good sources: local news sites, food/retail blogs (Eater, What Now, Patch, Gothamist), fashion/lifestyle sites (WWD, NSS Magazine), official company sites, real estate publications.
${blockedDomainsNote}

Return a JSON array of 1-3 sources. Each source needs:
- title: Article headline
- url: Full URL
- domain: Website domain (e.g., "eater.com")

Format: [{"title": "...", "url": "https://...", "domain": "..."}]
Return [] if nothing relevant found.`,
        },
      ],
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        },
      ],
    });

    // Extract sources from response
    const sources: StorySource[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        // Try to parse JSON from the response
        const jsonMatch = block.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed)) {
              for (const source of parsed) {
                // Filter out blocked sources
                if (source.url && !isBlockedSource(source.url, neighborhoodSlug)) {
                  sources.push({
                    title: source.title || 'Source',
                    url: source.url,
                    domain: source.domain || extractDomain(source.url),
                  });
                }
              }
            }
          } catch (e) {
            console.error('Failed to parse sources JSON:', e);
          }
        }
      }

      // Also check for web search results in tool_use blocks
      if (block.type === 'tool_use' && block.name === 'web_search') {
        // The search results will be in subsequent text blocks
        continue;
      }
    }

    return {
      text: story,
      sources: sources.slice(0, 2), // Max 2 sources per story
      googleSearchUrl,
      searchQuery,
    };
  } catch (error) {
    console.error('Error finding sources for story:', error);
    return {
      text: story,
      sources: [],
      googleSearchUrl,
      searchQuery,
    };
  }
}

/**
 * Main function: Find sources for all stories in a brief
 */
export async function findSourcesForBrief(
  briefContent: string,
  neighborhoodName: string,
  neighborhoodSlug: string,
  city: string,
  options?: {
    maxStories?: number;
    apiKey?: string;
  }
): Promise<EnrichedBrief> {
  const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not configured');
    return {
      stories: [],
      processedAt: new Date().toISOString(),
      model: 'none',
    };
  }

  const anthropic = new Anthropic({ apiKey });
  const stories = parseBriefIntoStories(briefContent);
  const maxStories = options?.maxStories || 6; // Limit to control costs
  const storiesToProcess = stories.slice(0, maxStories);

  console.log(`Finding sources for ${storiesToProcess.length} stories in ${neighborhoodName}...`);

  // Process stories in parallel (with some concurrency limit)
  const enrichedStories: EnrichedStory[] = [];
  const batchSize = 3; // Process 3 at a time to avoid rate limits

  for (let i = 0; i < storiesToProcess.length; i += batchSize) {
    const batch = storiesToProcess.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(story =>
        findSourcesForStory(story, neighborhoodName, neighborhoodSlug, city, anthropic)
      )
    );
    enrichedStories.push(...results);
  }

  return {
    stories: enrichedStories,
    processedAt: new Date().toISOString(),
    model: 'claude-sonnet-4-20250514',
  };
}

/**
 * Test function to verify source finding
 */
export async function testSourceFinding(): Promise<void> {
  const testBrief = `PopUp Bagels opens February 6, perfect for your morning fix.
Jay's Pizza aims for a February debut nearby. Amazon Go at Brookfield Place closed for good yesterday.
Etiq, a gemstone spot, just debuted on N. Moore. Issey Miyake's temporary store pops up there too.
Enfants Riches Déprimés plans a flagship in the hood.
Fresh plans drop today for converting the Sofia Brothers warehouse on Franklin Street.`;

  console.log('Testing source finding for Tribeca brief...\n');
  console.log('Input brief:', testBrief, '\n');

  const result = await findSourcesForBrief(
    testBrief,
    'Tribeca',
    'tribeca',
    'New York',
    { maxStories: 4 }
  );

  console.log('\nResults:');
  console.log('========\n');

  for (const story of result.stories) {
    console.log(`Story: "${story.text.slice(0, 60)}..."`);
    console.log(`Search query: ${story.searchQuery}`);
    if (story.sources.length > 0) {
      console.log('Sources found:');
      for (const source of story.sources) {
        console.log(`  - ${source.title}`);
        console.log(`    ${source.url}`);
      }
    } else {
      console.log('No sources found, fallback:');
      console.log(`  ${story.googleSearchUrl}`);
    }
    console.log('');
  }
}
