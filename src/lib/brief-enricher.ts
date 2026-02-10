/**
 * Brief Enricher
 *
 * Takes a neighborhood brief and enriches it with:
 * - Categorized stories
 * - Source links with attribution
 * - Additional context from sources
 * - Validation of claims
 *
 * Output format matches Gemini's enriched style.
 */

import Anthropic from '@anthropic-ai/sdk';
import { AI_MODELS } from '@/config/ai-models';

export interface EnrichedStoryItem {
  entity: string;           // "PopUp Bagels (Opens Feb 6)"
  source: {
    name: string;           // "What Now NY"
    url: string;            // Full URL
  } | null;
  context: string;          // Additional details from source
  secondarySource?: {
    name: string;
    url: string;
  };
  googleFallbackUrl: string; // Fallback search link
}

export interface EnrichedCategory {
  name: string;             // "Food & Dining Openings"
  stories: EnrichedStoryItem[];
}

export interface EnrichedBriefOutput {
  date: string;             // "Monday, February 2, 2026"
  neighborhood: string;
  categories: EnrichedCategory[];
  processedAt: string;
  model: string;
  blockedDomains: string[];
}

// Blocked domains per neighborhood
const BLOCKED_DOMAINS: Record<string, string[]> = {
  'tribeca': ['tribecacitizen.com'],
};

/**
 * Main function: Enrich a brief with sources and context
 */
export async function enrichBrief(
  briefContent: string,
  neighborhoodName: string,
  neighborhoodSlug: string,
  city: string,
  options?: {
    apiKey?: string;
    date?: string;
  }
): Promise<EnrichedBriefOutput> {
  const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const anthropic = new Anthropic({ apiKey });
  const blockedDomains = BLOCKED_DOMAINS[neighborhoodSlug.toLowerCase()] || [];
  const dateStr = options?.date || new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const blockedNote = blockedDomains.length > 0
    ? `\n\nCRITICAL: Do NOT include sources from: ${blockedDomains.join(', ')}. Find alternative sources instead.`
    : '';

  console.log(`Enriching brief for ${neighborhoodName}...`);

  const response = await anthropic.messages.create({
    model: AI_MODELS.CLAUDE_SONNET,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `Enrich this ${neighborhoodName}, ${city} neighborhood brief (${dateStr}) with source links.

BRIEF:
${briefContent}

INSTRUCTIONS:
1. Use web search to find 1 source per story (max 8 searches total)
2. Categorize into: Food & Dining, Retail & Fashion, Real Estate, Events
3. Add context from sources
${blockedNote}

CRITICAL: After searching, you MUST output valid JSON. Do not just search - output results!

OUTPUT FORMAT (must be valid JSON):
\`\`\`json
{
  "categories": [
    {
      "name": "Food & Dining",
      "stories": [
        {
          "entity": "PopUp Bagels (Opens Feb 6)",
          "source": {"name": "What Now NY", "url": "https://whatnow.com/..."},
          "context": "Confirmed at 315 Greenwich St. Originally targeted late 2025."
        }
      ]
    },
    {
      "name": "Retail & Fashion",
      "stories": [...]
    }
  ]
}
\`\`\`

Set "source": null if no source found. Now search and output JSON:`,
      },
    ],
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 8,
      },
    ],
  });

  // Extract JSON from response - collect all text blocks first
  let enrichedData: { categories: EnrichedCategory[] } = { categories: [] };
  let fullText = '';

  for (const block of response.content) {
    if (block.type === 'text') {
      fullText += block.text + '\n';
    }
  }

  console.log('Response length:', fullText.length);

  // Try multiple JSON extraction strategies
  let jsonFound = false;

  // Strategy 1: Look for ```json code block
  const codeBlockMatch = fullText.match(/```json\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (parsed.categories) {
        enrichedData = parsed;
        jsonFound = true;
        console.log('Parsed JSON from code block');
      }
    } catch (e) {
      console.log('Code block JSON parse failed:', e);
    }
  }

  // Strategy 2: Look for raw JSON object with categories
  if (!jsonFound) {
    const jsonMatch = fullText.match(/\{\s*"categories"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        enrichedData = parsed;
        jsonFound = true;
        console.log('Parsed raw JSON object');
      } catch (e) {
        console.log('Raw JSON parse failed:', e);
      }
    }
  }

  // Strategy 3: Find any valid JSON that looks like our structure
  if (!jsonFound) {
    // Look for the pattern more loosely
    const looseMatch = fullText.match(/\{[^{}]*"categories"[^{}]*\[[^\]]*\{[^}]*"name"[^}]*\}[\s\S]*?\]\s*\}/);
    if (looseMatch) {
      try {
        const parsed = JSON.parse(looseMatch[0]);
        enrichedData = parsed;
        jsonFound = true;
        console.log('Parsed loose JSON match');
      } catch (e) {
        console.log('Loose JSON parse failed:', e);
      }
    }
  }

  if (!jsonFound) {
    console.log('Could not parse JSON from response. First 1000 chars:');
    console.log(fullText.slice(0, 1000));
    console.log('...');
    console.log('Last 500 chars:');
    console.log(fullText.slice(-500));
  }

  // Post-process: filter blocked domains and add Google fallback URLs
  for (const category of enrichedData.categories) {
    for (const story of category.stories) {
      // Filter blocked domains
      if (story.source?.url && blockedDomains.some(d => story.source!.url.toLowerCase().includes(d))) {
        story.source = null;
        story.context = `[Source excluded per policy] ${story.context}`;
      }
      if (story.secondarySource?.url && blockedDomains.some(d => story.secondarySource!.url.toLowerCase().includes(d))) {
        delete story.secondarySource;
      }

      // Add Google fallback
      const searchQuery = `${neighborhoodName} ${story.entity.replace(/\s*\([^)]*\)/, '')}`;
      story.googleFallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
    }
  }

  return {
    date: dateStr,
    neighborhood: neighborhoodName,
    categories: enrichedData.categories,
    processedAt: new Date().toISOString(),
    model: AI_MODELS.CLAUDE_SONNET,
    blockedDomains,
  };
}

/**
 * Format enriched brief as markdown (similar to Gemini's output)
 */
export function formatEnrichedBriefAsMarkdown(brief: EnrichedBriefOutput): string {
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
        md += `* *Source:* **[${story.source.name}](${story.source.url})**\n`;
      } else {
        md += `* *Source:* [Search Google](${story.googleFallbackUrl})\n`;
      }

      md += `* *Context:* ${story.context}\n`;

      if (story.secondarySource) {
        md += `* *Secondary Source:* **[${story.secondarySource.name}](${story.secondarySource.url})**\n`;
      }

      md += '\n';
    }

    md += '\n';
  }

  return md;
}

/**
 * Format enriched brief as HTML for the UI component
 */
export function formatEnrichedBriefAsHTML(brief: EnrichedBriefOutput): string {
  let html = `<div class="enriched-brief">`;
  html += `<p class="brief-intro">Based on the news happening in <strong>${brief.neighborhood}</strong> around <strong>${brief.date}</strong>`;

  if (brief.blockedDomains.length > 0) {
    html += ` (excluding <em>${brief.blockedDomains.join(', ')}</em>)`;
  }
  html += `:</p>`;

  for (const category of brief.categories) {
    html += `<div class="brief-category">`;
    html += `<h4>${category.name}</h4>`;
    html += `<ul>`;

    for (const story of category.stories) {
      html += `<li class="brief-story">`;
      html += `<strong>${story.entity}</strong><br/>`;

      if (story.source) {
        html += `<span class="source">Source: <a href="${story.source.url}" target="_blank" rel="noopener">${story.source.name}</a></span><br/>`;
      } else {
        html += `<span class="source">Source: <a href="${story.googleFallbackUrl}" target="_blank" rel="noopener">Search Google</a></span><br/>`;
      }

      html += `<span class="context">${story.context}</span>`;

      if (story.secondarySource) {
        html += `<br/><span class="secondary-source">Also: <a href="${story.secondarySource.url}" target="_blank" rel="noopener">${story.secondarySource.name}</a></span>`;
      }

      html += `</li>`;
    }

    html += `</ul></div>`;
  }

  html += `</div>`;
  return html;
}
