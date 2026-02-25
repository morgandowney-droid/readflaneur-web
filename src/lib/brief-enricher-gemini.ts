/**
 * Brief Enricher using Google Gemini with Search Grounding
 *
 * Uses Gemini's built-in Google Search to find and verify sources.
 * Better at finding local-language sources (Swedish, etc.)
 */

import { GoogleGenAI } from '@google/genai';
import {
  LinkCandidate,
  injectHyperlinks,
  sanitizeMarkdownLinks,
  validateLinkCandidates,
} from './hyperlink-injector';

export interface EnrichedStoryItem {
  entity: string;
  source: {
    name: string;
    url: string;
  } | null;
  context: string;
  note?: string;
  secondarySource?: {
    name: string;
    url: string;
  };
  googleFallbackUrl: string;
}

export interface EnrichedCategory {
  name: string;
  stories: EnrichedStoryItem[];
}

export interface EnrichedBriefOutput {
  date: string;
  neighborhood: string;
  categories: EnrichedCategory[];
  processedAt: string;
  model: string;
  blockedDomains: string[];
  rawResponse?: string;
  linkCandidates?: LinkCandidate[];
  subjectTeaser?: string | null;
  emailTeaser?: string | null;
}

export interface ContinuityItem {
  date: string;         // "Monday, February 16"
  headline: string;
  excerpt?: string;     // First ~200 chars, sentence-truncated (briefs only)
  type: 'brief' | 'article';
  articleType?: string; // 'new_opening', 'closure', 'community_news', etc.
}

/**
 * Format continuity items into a labeled text block for the enrichment prompt.
 * Returns empty string if no items provided.
 */
function buildContinuityBlock(items: ContinuityItem[]): string {
  if (!items || items.length === 0) return '';

  const briefs = items.filter(i => i.type === 'brief');
  const articles = items.filter(i => i.type === 'article');

  let block = '\nRECENT COVERAGE CONTEXT (for continuity only - do NOT repeat these stories):\n';

  if (briefs.length > 0) {
    block += '\nPrevious Daily Briefs:\n';
    for (const b of briefs) {
      block += `- ${b.date}: "${b.headline}"\n`;
      if (b.excerpt) {
        block += `  Summary: ${b.excerpt}\n`;
      }
    }
  }

  if (articles.length > 0) {
    block += '\nRecent Articles:\n';
    for (const a of articles) {
      const typeLabel = a.articleType ? `[${a.articleType.replace(/_/g, ' ')}] ` : '';
      block += `- ${a.date}: ${typeLabel}"${a.headline}"\n`;
    }
  }

  return block;
}

/**
 * Post-process email teaser to fix patterns Gemini stubbornly produces
 * despite explicit prompt instructions. Gemini follows JSON examples better
 * than prose rules, but some patterns still slip through.
 */
function cleanEmailTeaser(teaser: string): string {
  let cleaned = teaser;

  // Strip connective filler at the start of sentences
  // "Plus, X." -> "X." / "Also, X." -> "X." / "And X." -> "X." / "Meanwhile, X." -> "X."
  cleaned = cleaned.replace(/(?:^|(?<=\.\s))(?:Plus,?\s|Also,?\s|And\s|Meanwhile,?\s|In addition,?\s)/gi, '');

  // Convert passive future to active present: "starts tomorrow" -> "now live"
  cleaned = cleaned.replace(/\bstarts?\s+tomorrow\b/gi, 'now live');
  cleaned = cleaned.replace(/\bopens?\s+tomorrow\b/gi, 'just opened');
  cleaned = cleaned.replace(/\bbegins?\s+tomorrow\b/gi, 'now live');
  cleaned = cleaned.replace(/\blaunches?\s+tomorrow\b/gi, 'finally launches');
  cleaned = cleaned.replace(/\bwill\s+open\b/gi, 'opens');
  cleaned = cleaned.replace(/\bwill\s+launch\b/gi, 'launches');
  cleaned = cleaned.replace(/\bis\s+expected\s+to\b/gi, '');
  cleaned = cleaned.replace(/\bbegins?\s+next\s+week\b/gi, 'now live');

  // Strip boilerplate openers: "See what's on at X" -> "X"
  // "Check out X" -> "X" / "Catch X at Y" -> "X at Y"
  cleaned = cleaned.replace(/(?:^|(?<=\.\s))See what's on at\s+/gi, '');
  cleaned = cleaned.replace(/(?:^|(?<=\.\s))Check out\s+/gi, '');
  cleaned = cleaned.replace(/(?:^|(?<=\.\s))Catch\s+(?:the\s+)?/gi, '');
  cleaned = cleaned.replace(/(?:^|(?<=\.\s))Don't miss\s+/gi, '');

  // Clean up any double spaces or leading/trailing whitespace
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  // Ensure it still starts with a capital letter after stripping
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

// Blocked domains per neighborhood
const BLOCKED_DOMAINS: Record<string, string[]> = {
  'tribeca': ['tribecacitizen.com'],
};

/**
 * Main function: Enrich a brief using Gemini with Google Search
 */
export async function enrichBriefWithGemini(
  briefContent: string,
  neighborhoodName: string,
  neighborhoodSlug: string,
  city: string,
  country: string = 'USA',
  options?: {
    apiKey?: string;
    date?: string;
    /** ISO timestamp of when the brief was generated (for correct "today"/"tomorrow" context) */
    briefGeneratedAt?: string;
    /** IANA timezone string (e.g., 'Asia/Tokyo') - use this instead of country-based lookup */
    timezone?: string;
    /** Article type determines writing style: 'daily_brief' includes casual intro/outro, 'weekly_recap' is direct, 'look_ahead' is forward-looking */
    articleType?: 'daily_brief' | 'weekly_recap' | 'look_ahead';
    /** Override the model ID (used by Pro-first-Flash-fallback strategy) */
    modelOverride?: string;
    /** Recent coverage history for narrative continuity (daily briefs only) */
    continuityContext?: ContinuityItem[];
  }
): Promise<EnrichedBriefOutput> {
  const apiKey = options?.apiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const genAI = new GoogleGenAI({ apiKey });
  const blockedDomains = BLOCKED_DOMAINS[neighborhoodSlug.toLowerCase()] || [];

  // Determine the context time - use provided timestamp or current time
  const contextTime = options?.briefGeneratedAt
    ? new Date(options.briefGeneratedAt)
    : new Date();

  // Use the IANA timezone from DB (e.g., 'Asia/Tokyo') directly.
  // Fall back to country-based lookup only if timezone not provided.
  const countryTimezoneMap: Record<string, string> = {
    'Sweden': 'Europe/Stockholm',
    'USA': 'America/New_York',
    'France': 'Europe/Paris',
    'Germany': 'Europe/Berlin',
    'Spain': 'Europe/Madrid',
    'Italy': 'Europe/Rome',
    'UK': 'Europe/London',
    'Japan': 'Asia/Tokyo',
    'Australia': 'Australia/Sydney',
    'Singapore': 'Asia/Singapore',
    'UAE': 'Asia/Dubai',
    'South Africa': 'Africa/Johannesburg',
    'Brazil': 'America/Sao_Paulo',
    'Mexico': 'America/Mexico_City',
    'India': 'Asia/Kolkata',
    'China': 'Asia/Shanghai',
    'South Korea': 'Asia/Seoul',
    'Thailand': 'Asia/Bangkok',
    'Netherlands': 'Europe/Amsterdam',
    'Ireland': 'Europe/Dublin',
    'Portugal': 'Europe/Lisbon',
    'Switzerland': 'Europe/Zurich',
    'Austria': 'Europe/Vienna',
    'Denmark': 'Europe/Copenhagen',
    'Norway': 'Europe/Oslo',
    'Finland': 'Europe/Helsinki',
    'Belgium': 'Europe/Brussels',
    'Greece': 'Europe/Athens',
    'Turkey': 'Europe/Istanbul',
    'Israel': 'Asia/Jerusalem',
    'Canada': 'America/Toronto',
    'Argentina': 'America/Argentina/Buenos_Aires',
    'Chile': 'America/Santiago',
    'Colombia': 'America/Bogota',
    'New Zealand': 'Pacific/Auckland',
    'Hong Kong': 'Asia/Hong_Kong',
    'Taiwan': 'Asia/Taipei',
    'Philippines': 'Asia/Manila',
    'Indonesia': 'Asia/Jakarta',
    'Malaysia': 'Asia/Kuala_Lumpur',
    'Vietnam': 'Asia/Ho_Chi_Minh',
  };
  const timezone = options?.timezone || countryTimezoneMap[country] || 'America/New_York';

  // Format date for display (use neighborhood's timezone, not server timezone)
  const dateStr = options?.date || contextTime.toLocaleDateString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Format the context time with timezone for Gemini
  // Always present as 7 AM delivery time - briefs may be generated as early as
  // midnight but are always delivered at 7 AM local time
  const contextTimeStr = contextTime.toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).replace(/\d{1,2}:\d{2}\s*(AM|PM)/, '7:00 AM');

  // Determine language hint based on country
  const languageHint = country === 'Sweden' ? 'IMPORTANT: Search Swedish news sites like Thatsup.se, Restaurangvärlden, Mitt i, DN.se, and SVD.se. Also try Swedish search terms like "öppnar", "nytt café", "restaurang".' :
                       country === 'France' ? 'Search in both French and English. Try French news sites.' :
                       country === 'Germany' ? 'Search in both German and English. Try German news sites.' :
                       country === 'Spain' ? 'Search in both Spanish and English. Try Spanish news sites.' :
                       country === 'Italy' ? 'Search in both Italian and English. Try Italian news sites.' :
                       '';

  const blockedNote = blockedDomains.length > 0
    ? `\n\nDo NOT include sources from: ${blockedDomains.join(', ')}`
    : '';

  // Dense urban cities where most people walk, bike, or use transit
  const denseUrbanCities = ['New York', 'London', 'Paris', 'Stockholm', 'Amsterdam', 'Chicago', 'Singapore', 'Tokyo', 'Sydney', 'Dublin', 'San Francisco', 'Washington DC', 'Cape Town'];
  const isDenseUrban = denseUrbanCities.some(c => city.toLowerCase().includes(c.toLowerCase()));
  const urbanContextNote = isDenseUrban
    ? `\n\nURBAN CONTEXT: ${city} is a dense, walkable city. Most residents walk, bike, or use public transit. Do NOT reference driving, parking, or cars unless the story is specifically about traffic policy, road closures, or transit infrastructure. Never assume readers drive.`
    : '';

  const articleType = options?.articleType || 'daily_brief';
  const continuityBlock = articleType === 'daily_brief'
    ? buildContinuityBlock(options?.continuityContext || [])
    : ''; // Continuity context only applies to daily briefs

  // System instruction varies by article type
  const basePersona = `You are a well-travelled, successful 35-year-old who has lived in ${neighborhoodName}, ${city} for years. You know every corner of the neighborhood - the hidden gems, the local drama, the new openings before anyone else does.

CRITICAL CONTEXT - CURRENT TIME: It is currently ${contextTimeStr} in ${neighborhoodName}. The LOCAL date today is ${dateStr}. When you refer to "today", "tomorrow", "this week", etc., use this timestamp as your reference point. This is when readers will see your update.
DATE CORRECTION: The source material below may reference dates/days from when data was collected (which could be a different calendar day in a different timezone). You MUST correct ALL date references to match the LOCAL date above. If the source says "Friday" but the local date is a Saturday, write "Saturday". If the source says "February 20" but the local date is February 21, write "February 21". The local date is always authoritative.

IMPORTANT: Your response will be published directly to readers in a neighborhood newsletter. You are NOT responding to the person who submitted this query - you are writing content for third-party readers who live in ${neighborhoodName}.`;

  const dailyBriefStyle = `
Your writing style:
- Knowledgeable but not pretentious
- Deadpan humor when appropriate
- You drop specific details that only a local would know (exact addresses, which corner, who owns what)
- You present information conversationally, like telling a friend what's happening in the neighborhood
- Start with a brief, casual intro greeting in the LOCAL LANGUAGE of the neighborhood (e.g., "God morgon, grannar." for Stockholm, "Bonjour, voisins." for Paris, "Buongiorno." for Milan, "Goedemorgen." for Amsterdam). For English-speaking cities, use "Good morning" with a local twist (e.g., "Morning, neighbors." for New York, "Good morning, loves." for London). This local greeting is the signature charm of each brief.
- End with a brief, friendly sign-off in the LOCAL LANGUAGE (e.g., "Ha en fin dag." for Stockholm, "Bonne journee." for Paris, "Vi ses." for Stockholm). For English-speaking cities, a casual farewell works (e.g., "See you tomorrow." or "Enjoy the day.").
- CRITICAL: This is a DAILY update published every morning. Never use "another week", "this week's roundup", or any weekly/monthly framing. Treat each brief as today's news.
- CRITICAL: If you cannot verify something with a source, DO NOT mention it at all. Only include stories you can confirm.
- Never say "you mentioned" or correct the query - just write about what IS happening
- ALWAYS write the main prose in English, but ALWAYS include 1-2 local language phrases naturally throughout (not just in greetings/sign-offs). Examples: a Swedish brief might say "the new konditori on Odengatan" instead of "the new pastry shop", a French brief might reference "the quartier" instead of "the neighborhood". These local touches are the seasoning that gives each brief its distinctive flavor and sense of place. All section headers MUST be in English.

TONE AND VOCABULARY:
- Do NOT use lowbrow or overly casual words like "ya", "folks", "eats", "grub", "spot" (for restaurant)
- Use "food" instead of "eats", use "you" instead of "ya", use "people" or "locals" instead of "folks"
- NEVER use em dashes (\u2014). Use commas, periods, or hyphens (-) instead.
- The reader is well-educated and prefers polished language without slang
- The final sentence or paragraph must NOT be a question or seek a response from the reader
- End with a statement, not an invitation for feedback or engagement

You're the neighbor everyone wishes they had - always in the know, never boring.
- TOURIST TRAP FILTER: DROP only these specific items: guided walking tours, food tours, hop-on-hop-off buses, segway tours, pub crawls, escape rooms. Keep everything else - gallery openings, pop-up markets, concerts, restaurant openings, exhibitions, community events, etc. are all valuable content.
- ENERGY: NEVER describe a day or period as "quiet", "slow", "calm", or "not much happening". There is ALWAYS something worth covering. Banned: "quiet Friday", "quiet week", "slow day", "calm week", "things are winding down". Lead with energy about what IS happening.
- If a story in today's tips relates to RECENT COVERAGE CONTEXT below, you may briefly reference it (e.g., "as we noted Tuesday...", "following up on last week's opening..."). Do this sparingly - only when it adds genuine value.
- RECENT COVERAGE CONTEXT is background knowledge only. If nothing connects to today's stories, ignore it entirely. Never list or summarize previous coverage.`;

  const weeklyRecapStyle = `
Your writing style:
- Professional and informative local journalism
- CRITICAL: NO intro paragraph, NO greeting, NO small talk - jump DIRECTLY into the first news section
- CRITICAL: NO outro paragraph, NO sign-off - end with the last piece of news content
- Knowledgeable and authoritative
- You drop specific details that only a local would know (exact addresses, which corner, who owns what)
- CRITICAL: If you cannot verify something with a source, DO NOT mention it at all. Only include stories you can confirm.
- Never say "you mentioned" or correct the query - just write about what IS happening
- ALWAYS write the main prose in English, but naturally include 1-2 local language terms throughout (e.g., "konditori" instead of "pastry shop" in Stockholm, "quartier" instead of "neighborhood" in Paris). These local touches give each edition its distinctive sense of place. All section headers MUST be in English.

TONE AND VOCABULARY:
- Do NOT use lowbrow or overly casual words like "ya", "folks", "eats", "grub", "spot" (for restaurant)
- Use "food" instead of "eats", use "you" instead of "ya", use "people" or "locals" instead of "folks"
- NEVER use em dashes (\u2014). Use commas, periods, or hyphens (-) instead.
- The reader is well-educated and prefers polished language without slang

This is The Sunday Edition - a weekly community recap published on Sunday. Even if you are processing this on a different day, write as if it is Sunday (use the CURRENT TIME date provided above as your reference). Do not reference Monday or any day after Sunday. Straight news, no fluff.

ONE STORY PER SECTION: Each distinct story gets its own [[header]] and paragraph. NEVER combine two unrelated stories in the same section. A zoning decision and a restaurant closure are two separate stories - give each its own section.
STORY ORDER: Lead with the most consequential and recent story first. A safety incident or policy change that affects residents outranks a restaurant opening. Within the same significance level, more recent events lead over older ones.`;

  const lookAheadStyle = `
Your writing style:
- Professional and informative local journalism with a forward-looking focus
- CRITICAL: NO intro paragraph, NO greeting, NO small talk - jump DIRECTLY into the first event
- CRITICAL: NO outro paragraph, NO sign-off - end with the last event
- Organize by INDIVIDUAL DAY headers using [[Day, Weekday Month Date]] format. Start with [[Today, Wednesday February 18]], then [[Thursday, February 19]], [[Friday, February 20]], etc. for each day that has events. Skip days with no events. This makes the article scannable so readers can quickly find what's happening on a specific day.
- Each event must include: what it is, where (specific address), when (date and time), and why it matters
- CRITICAL: ONLY include events you can verify with a real source. If you cannot find a source, LEAVE IT OUT
- Never include past events or vague "coming soon" items without dates
- ALWAYS write the main prose in English, but naturally include 1-2 local language terms throughout (e.g., "konditori" instead of "pastry shop" in Stockholm, "quartier" instead of "neighborhood" in Paris). All section headers MUST be in English.

TONE AND VOCABULARY:
- Do NOT use lowbrow or overly casual words like "ya", "folks", "eats", "grub", "spot" (for restaurant)
- NEVER use em dashes (\u2014). Use commas, periods, or hyphens (-) instead.
- The reader is well-educated and prefers polished language without slang

IMPORTANT TIMING: This is a Look Ahead published at 7 AM local time. It was prepared the evening before but readers see it in the morning. "Today" means the publication date shown in the CURRENT TIME above. Frame all dates from the reader's morning perspective. Focus exclusively on upcoming, confirmed events and happenings over the next 7 days.

HEADLINE RULES: NEVER generate passive, defeatist, or "nothing happening" headlines. There is ALWAYS something worth highlighting. Banned patterns: "Quiet Week", "Slow Week", "Not Much Going On", "A Calm Week", "Nothing Major". Always lead with the most interesting specific event or venue name.

ENERGY RULES: NEVER describe a period as "quiet", "slow", "calm", or "not much happening" - not in headlines, not in body text, not in opening lines. There is ALWAYS something worth covering. Banned phrases in body text: "quiet Friday", "quiet week", "slow week", "calm week", "not much going on", "things are winding down". Instead, lead with enthusiasm about what IS happening - "It's Friday!" not "It's a quiet Friday".

NO REPETITION: NEVER repeat the same venue, restaurant, or event across multiple day sections. If a venue is open every day (like a restaurant or bar), mention it ONCE on the most relevant day and move on. A Look Ahead that lists the same place on Monday, Tuesday, Wednesday, Thursday is useless padding. Each day section should feature DIFFERENT events. If there genuinely aren't enough distinct events to fill every day, SKIP those days entirely rather than repeating content. Quality over quantity - 3 days with unique events is far better than 7 days repeating the same venue.

TOURIST TRAP FILTER: EXCLUDE only these specific items: permanent Broadway/West End shows ("Mamma Mia!", "The Lion King", "Phantom of the Opera", "Wicked"), guided walking tours, food tours, hop-on-hop-off buses, segway tours, pub crawls, escape rooms. Keep everything else - gallery opening receptions, temporary exhibition premieres, pop-up markets, concerts, comedy shows, restaurant/bar openings, art shows, food festivals, sports events, community events, museum special exhibitions, theater premieres are all valuable content.

GALLERY/MUSEUM FILTER (CRITICAL): Do NOT include a gallery or museum simply because it is open during normal hours. An ongoing exhibition that opened weeks ago is NOT an event. Only include galleries/museums when there is a SPECIFIC time-limited occasion: opening reception (with evening time), closing day, artist talk, new exhibition premiere, special ticketed event. The test: would a local specifically plan to visit on THIS day? If no, cut it.

ONE EVENT PER SECTION: Within each day, each distinct event gets its own paragraph. NEVER lump two unrelated events together in the same paragraph. A museum exhibition and a restaurant opening are separate items.
EVENT ORDER: Within each day section, lead with the most noteworthy event first - a one-time special event (gallery opening, premiere, limited pop-up) outranks a recurring weekly happening. Time-sensitive events (last day of an exhibition, opening night) outrank ongoing ones.`;

  const systemInstruction = basePersona + (
    articleType === 'weekly_recap' ? weeklyRecapStyle :
    articleType === 'look_ahead' ? lookAheadStyle :
    dailyBriefStyle
  );

  console.log(`Enriching brief for ${neighborhoodName} using Gemini...`);

  const prompt = `Here are some tips about what might be happening in ${neighborhoodName}, ${city}. Research each one and write a neighborhood update for our readers.

${briefContent}
${blockedNote}${urbanContextNote}${continuityBlock}

${languageHint}

IMPORTANT RULES:
1. ONLY include stories you can verify with a real source (news article, official site, local blog)
2. If you cannot find a source for something, LEAVE IT OUT completely - do not mention it
3. Do not reference or correct the input - write as if you discovered this news yourself
4. For verified stories, include specific local details:
   - Exact addresses ("Sturegatan 17", "corner of Sibyllegatan and Valhallavägen")
   - Real dates and times
   - The actual business/project names
   - Any backstory or context

FORMATTING RULES:
${articleType === 'look_ahead' || articleType === 'weekly_recap' ? '- CRITICAL: Do NOT include any greeting or intro line. Jump DIRECTLY into the first section header or event.' : `- CRITICAL: Your very first line MUST be a morning greeting to the neighborhood in the LOCAL LANGUAGE (e.g., "God morgon, grannar." for Stockholm, "Bonjour, ${neighborhoodName}." for Paris, "Good morning, ${neighborhoodName}." for English-speaking cities). This greeting is non-negotiable - every Daily Brief opens with it. Do NOT skip it, do NOT jump straight into section headers.`}
- DATE REFERENCES: When using relative time words (yesterday, today, tomorrow, Thursday, last week, this morning, etc.), ALWAYS include the explicit calendar date - e.g., "yesterday (February 19)", "this Thursday, February 20", "last week (February 10-14)". Readers may see this days later, so relative references alone are confusing.
- Organize your update into sections with creative, punchy section headers
- IMPORTANT: Wrap each section header in double brackets like this: [[Section Header Here]]
- Section headers should be catchy and conversational (e.g., "[[The Bagel Wars Begin]]", "[[Lunch Spot of the Week]]")
- Do NOT use markdown headers (#) or bold (**) - only use [[double brackets]] for headers
- ONE STORY PER SECTION: Each distinct story gets its own [[header]] and paragraph. NEVER combine two unrelated stories in the same section. A coffee shop ranking and a park incident are two separate stories - give each its own section.
- STORY ORDER: Lead with the most RECENT and surprising news first. A police incident or community controversy from yesterday outranks a restaurant opening from 10 days ago. Recency matters - something that happened yesterday or today always leads over something from last week. Within the same time frame, prioritize the most unusual, consequential, or conversation-worthy story.

Write it like you're the neighborhood insider sharing what's actually happening - conversational but factual. This will be published directly to readers.

SUBJECT TEASER (MANDATORY):
Generate a 1-4 word "information gap" teaser for the email subject line. This teaser appears after "Daily Brief: {Neighborhood}." and must compel the reader to open the email simply to understand what it means. Think Morning Brew style - cryptic, intriguing, incomplete. Examples: "rent freeze showdown", "bakery switch", "40 floors down", "rats won", "building of the year". Rules:
- 1-4 words MAXIMUM (shorter is better)
- Must relate to the most interesting story in the brief
- Must NOT be a complete sentence or make full sense on its own
- Must NOT be clickbait or misleading - it should relate to real content
- Must NOT include the neighborhood name
- ALL LOWERCASE. No capital letters at all, not even for the first word. Only exception: proper nouns that are always capitalized (brand names like "IKEA", people's names like "de Blasio")
- Do NOT start with "the" - just drop it. "building of the year" not "the building of the year". "bakery switch" not "the bakery switch"
- No punctuation except when part of a proper name

EMAIL TEASER (MANDATORY):
Generate 2-3 standalone information nuggets (max 160 chars total) for the email blurb. Each sentence is a punchy, self-contained fact. No connective tissue between them - no "Plus,", "Also,", "And", "Meanwhile". Just nugget after nugget. Examples:
- "Village snowball fight against NYPD. Hello Kees bar and Dahla Thai. Goodbye Da Toscano."
- "Shin Takumi finally opens on Spring St. DEJAVU pop-up extended again. Golden Steer reservations live."
- "Fondue night at Raclette. Wild new show at Vanguard gallery. Louis Vuitton pop-up rolls on."
- "Wasahof's husmanskost menu now live. Cool new art at Galleri Duerr. Forskaren wins building of the year."
Rules:
- Each sentence is a STANDALONE NUGGET. No "Plus,", "Also,", "And,", "Meanwhile,", "In addition" - these are filler words that waste precious characters
- Max 160 characters total
- Must include at least one specific name (person, place, business, event)
- Use ACTIVE, PRESENT-TENSE language. Say "now live", "just opened", "finally launches", "gone for good", "rolls on". NEVER say "starts tomorrow", "will open", "is expected to", "begins next week" - these defer the action and kill urgency. Make it sound like it's happening NOW
- NO boilerplate like "Catch art openings at X and Y" or "New art at X and Y" - instead "Cool new art at X" or "X debuts wild new show". One venue per sentence, not lists
- NO greetings, NO filler ("Here's what's happening"), NO vague openers
- NO "In {neighborhood}" or "This week in" framing

After your prose, include this JSON with ONLY the verified stories:
\`\`\`json
{
  "categories": [
    {
      "name": "Category Name",
      "stories": [
        {
          "entity": "Entity Name (key detail)",
          "source": {"name": "Source Name", "url": "https://..."},
          "context": "Your insider context here..."
        }
      ]
    }
  ],
  "link_candidates": [
    {"text": "Exact phrase from your prose"}
  ],
  "subject_teaser": "rent freeze showdown",
  "email_teaser": "Shin Takumi finally opens on Spring St. DEJAVU pop-up extended again. Golden Steer reservations live."
}
\`\`\`

LINK CANDIDATES RULES (MANDATORY - you MUST include these):
- Include 3-6 key entities worth hyperlinking from your prose
- This is REQUIRED for all content types including weekly recaps
- Use the EXACT text as it appears in your prose (case-sensitive matching)
- Prioritize: business names, venue names, notable people, referenced articles
- Only include entities that readers would want to learn more about
- If your prose mentions specific places, restaurants, events, or people by name, those MUST appear in link_candidates`;

  try {
    // Pro-first, Flash-fallback: caller passes modelOverride based on daily Pro budget
    const modelId = options?.modelOverride || 'gemini-2.5-flash';

    // Retry with exponential backoff on quota errors (429 RESOURCE_EXHAUSTED)
    const RETRY_DELAYS = [2000, 5000, 15000]; // 2s, 5s, 15s
    let response;
    let lastError: unknown;

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        response = await genAI.models.generateContent({
          model: modelId,
          contents: `${systemInstruction}\n\n${prompt}`,
          config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.6,
          },
        });
        break; // Success - exit retry loop
      } catch (err: unknown) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        const isQuotaError = errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429');

        if (!isQuotaError || attempt >= RETRY_DELAYS.length) {
          throw err; // Non-quota error or exhausted retries
        }

        console.warn(`Gemini quota hit (attempt ${attempt + 1}/${RETRY_DELAYS.length + 1}), retrying in ${RETRY_DELAYS[attempt]}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
      }
    }

    if (!response) {
      throw lastError || new Error('Gemini enrichment failed after retries');
    }

    const rawText = response.text || '';

    // Strip markdown and JSON from response for clean prose display
    // But preserve [[section headers]] which we explicitly asked for
    let text = rawText
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** -> bold
      .replace(/\*([^*]+)\*/g, '$1')       // *italic* -> italic
      .replace(/```json[\s\S]*?```/g, '')  // Remove JSON code blocks
      .replace(/```[\s\S]*?```/g, '')      // Remove other code blocks
      // Preserve markdown links [text](url) - they're rendered as clickable <a> tags at display time
      .replace(/^#+\s+/gm, '')             // Remove heading markers
      .replace(/\{\s*"?categories"?[\s\S]*$/i, '')  // Remove trailing JSON
      .replace(/\{\s*categories[\s\S]*$/i, '')     // Remove unquoted JSON variant
      // Strip teaser labels that Gemini outputs as prose (these are for JSON only, not display)
      .replace(/^(?:SUBJECT|subject)[_ ](?:TEASER|teaser):.*$/gm, '')
      .replace(/^(?:EMAIL|email)[_ ](?:TEASER|teaser):.*$/gm, '')
      .replace(/^(Daily Brief|Look Ahead|DAILY BRIEF|LOOK AHEAD)[:\s]*[^.!?\n]*[.!?\n]\s*/im, '')
      // Clean Gemini Google Search grounding citation artifacts
      .replace(/\.\(/g, '.')               // .( -> . (citation artifact, never valid English)
      .replace(/\.\s*\(\d+\)/g, '.')       // . (1) or .(2) -> . (numbered citations)
      .replace(/\s*\(\d+\)/g, '')          // inline (1) (2) citation numbers
      .replace(/\(\s*\)/g, '')             // () empty parens
      .replace(/\(\s*$/gm, '')             // Orphaned ( at end of line
      // Replace em dashes with hyphens (em dashes look AI-generated)
      .replace(/\u2014/g, ' - ')           // — (em dash) -> space-hyphen-space
      .replace(/\u2013/g, '-')             // – (en dash) -> hyphen
      .replace(/\n{3,}/g, '\n\n')          // Collapse multiple newlines
      .trim();

    console.log('Gemini response length:', text.length);

    // Extract JSON from original response (before markdown stripping)
    let enrichedData: { categories: EnrichedCategory[]; link_candidates?: unknown[] } = { categories: [] };
    let linkCandidates: LinkCandidate[] = [];
    let subjectTeaser: string | null = null;
    let emailTeaser: string | null = null;

    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        if (parsed.categories) {
          enrichedData = parsed;
          console.log('Parsed JSON from Gemini response');
        }
        // Extract and validate link candidates
        if (parsed.link_candidates) {
          linkCandidates = validateLinkCandidates(parsed.link_candidates);
          console.log(`Found ${linkCandidates.length} valid link candidates`);
        }
        // Extract subject teaser (1-4 words, max 40 chars)
        if (parsed.subject_teaser && typeof parsed.subject_teaser === 'string') {
          const t = parsed.subject_teaser.trim();
          const wordCount = t.split(/\s+/).length;
          if (wordCount >= 1 && wordCount <= 5 && t.length <= 40) {
            subjectTeaser = t;
            console.log(`Subject teaser: "${subjectTeaser}"`);
          } else {
            console.warn(`Subject teaser rejected (${wordCount} words, ${t.length} chars): "${t}"`);
          }
        }
        // Extract email teaser (2-3 sentences, 10-200 chars, must contain a period/exclamation)
        if (parsed.email_teaser && typeof parsed.email_teaser === 'string') {
          const et = cleanEmailTeaser(parsed.email_teaser.trim());
          const hasEnding = /[.!]/.test(et);
          const isGreeting = /^(good morning|god morgon|bonjour|buongiorno|guten morgen|buenos d[ií]as|bom dia|goedemorgen|morning)/i.test(et);
          if (et.length >= 10 && et.length <= 200 && hasEnding && !isGreeting) {
            emailTeaser = et;
            console.log(`Email teaser: "${emailTeaser}"`);
          } else {
            console.warn(`Email teaser rejected (${et.length} chars, hasEnding=${hasEnding}, isGreeting=${isGreeting}): "${et}"`);
          }
        }
      } catch (e) {
        console.error('Failed to parse Gemini JSON:', e);
      }
    }

    // If no JSON found, try to extract structured data from the natural response
    if (enrichedData.categories.length === 0) {
      console.log('No JSON found, returning raw response for manual review');

      if (linkCandidates.length > 0 && text) {
        text = injectHyperlinks(text, linkCandidates, { name: neighborhoodName, city });
      }

      return {
        date: dateStr,
        neighborhood: neighborhoodName,
        categories: [],
        processedAt: new Date().toISOString(),
        model: modelId,
        blockedDomains,
        rawResponse: text,
        linkCandidates,
        subjectTeaser,
        emailTeaser,
      };
    }

    // Post-process: filter blocked domains and add fallback URLs
    for (const category of enrichedData.categories) {
      for (const story of category.stories) {
        // Filter blocked domains
        if (story.source?.url && blockedDomains.some(d => story.source!.url.toLowerCase().includes(d))) {
          story.source = null;
          story.context = `[Source excluded] ${story.context}`;
        }

        // Add Google fallback
        const searchQuery = `${neighborhoodName} ${story.entity.replace(/\s*\([^)]*\)/, '')}`;
        story.googleFallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
      }
    }

    // Sanitize any Gemini-generated markdown links with unencoded parens in URLs
    text = sanitizeMarkdownLinks(text);

    if (linkCandidates.length > 0 && text) {
      text = injectHyperlinks(text, linkCandidates, { name: neighborhoodName, city });
    }

    return {
      date: dateStr,
      neighborhood: neighborhoodName,
      categories: enrichedData.categories,
      processedAt: new Date().toISOString(),
      model: modelId,
      blockedDomains,
      rawResponse: text,
      linkCandidates,
      subjectTeaser,
      emailTeaser,
    };

  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}

/**
 * Format enriched brief as markdown
 */
export function formatGeminiEnrichedBriefAsMarkdown(brief: EnrichedBriefOutput): string {
  // If we have raw response but no parsed categories, return the raw response
  if (brief.categories.length === 0 && brief.rawResponse) {
    return brief.rawResponse;
  }

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
        md += `  * *Source:* **[${story.source.name}](${story.source.url})**\n`;
      } else {
        md += `  * *Source:* [Search Google](${story.googleFallbackUrl})\n`;
      }

      md += `  * *Context:* ${story.context}\n`;

      if (story.note) {
        md += `  * *Note:* ${story.note}\n`;
      }

      if (story.secondarySource) {
        md += `  * *Also:* **[${story.secondarySource.name}](${story.secondarySource.url})**\n`;
      }

      md += '\n';
    }
  }

  return md;
}
