/**
 * Audio Bulletin Script Generation
 *
 * Generates 2-minute news bulletin scripts for yous.news with phonetic
 * pronunciation guides. Content sourced from yous.news homepage (which
 * Flaneur writes). Structure mirrors real Irish radio bulletins:
 *   1. Lead story (~40s) - Ireland or world
 *   2. Three Ireland-linked stories (~20s each)
 *   3. Human interest/light closer (~20s) - "and finally..."
 *
 * Weather + market update appended by yous.news (not generated here).
 */

import { GoogleGenAI } from '@google/genai';
import { AI_MODELS } from '@/config/ai-models';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BulletinStory {
  headline: string;
  blurb: string;
  category: string;
  source: string;
  reportedAt?: string;
}

export interface RecentBulletin {
  script: string;
  generated_at: string;
}

export interface BulletinResult {
  script: string;
  pronunciations: Record<string, string>;
  story_count: number;
  generated_at: string;
  hour: string;
}

// ---------------------------------------------------------------------------
// Static Phonetic Dictionary — Irish terms, places, names
// ---------------------------------------------------------------------------

export const IRISH_PHONETICS: Record<string, string> = {
  // Government & politics
  'Taoiseach': 'TEE-shuck',
  'Tánaiste': 'TAW-nish-teh',
  'Dáil': 'DOYL',
  'Seanad': 'SHAN-ad',
  'Dáil Éireann': 'DOYL AIR-in',
  'Seanad Éireann': 'SHAN-ad AIR-in',
  'Oireachtas': 'EAR-ock-tus',
  'Teachta Dála': 'CHOCK-tah DAW-lah',
  'Uachtarán': 'OOK-tah-rawn',
  'Fianna Fáil': 'FEE-anna FOYL',
  'Fine Gael': 'FIN-ah GALE',
  'Sinn Féin': 'Shin FAYN',
  'Aontú': 'AYN-too',

  // People in Irish politics
  'Micheál Martin': 'mee-HAWL MAR-tin',
  'Micheál': 'mee-HAWL',
  'Varadkar': 'var-AD-kar',
  'Coveney': 'CUV-nee',
  'Donohoe': 'DUN-ah-hoo',
  'Ó Ríordáin': 'oh REER-dawn',
  'Ó Broin': 'oh BRIN',
  'Caoimhghín': 'KWEE-veen',
  'Pádraig': 'PAW-drig',
  'Seán': 'SHAWN',
  'Éamon': 'AY-mun',
  'Mairéad': 'mah-RAYD',
  'Gráinne': 'GRAWN-yah',
  'Siobhán': 'shiv-AWN',
  'Niamh': 'NEEV',
  'Aoife': 'EE-fah',
  'Ciarán': 'KEER-awn',
  'Oisín': 'USH-een',
  'Ruairí': 'ROO-ree',
  'Cathal': 'KAH-hal',
  'Bríd': 'BREED',
  'Saoirse': 'SEER-shah',
  'Méabh': 'MAYV',
  'Meadhbh': 'MAYV',
  'Caoimhe': 'KWEE-vah',
  'Ailbhe': 'AL-vah',
  'Roisín': 'ro-SHEEN',
  'Orlaith': 'OR-lah',
  'Laoise': 'LEE-shah',
  'Tadhg': 'TYGE',
  'Diarmuid': 'DEER-mid',
  'Eoghan': 'OH-en',
  'Fearghal': 'FAR-al',
  'Colm': 'KUL-um',
  'Donal': 'DUN-al',
  'Pól': 'POLE',

  // Cities and towns
  'Dún Laoghaire': 'Dun LEER-ee',
  'Cobh': 'COVE',
  'Drogheda': 'DRAW-hed-ah',
  'Clonakilty': 'CLON-ah-KILL-tee',
  'Youghal': 'YAWL',
  'Béal Feirste': 'BAIL FAIR-shteh',
  'Baile Átha Cliath': 'BOLL-yah AW-hah CLEE-ah',
  'Gaillimh': 'GOLL-iv',
  'Corcaigh': 'KOR-kig',
  'Luimneach': 'LIM-nuck',
  'Trá Lí': 'TRAW LEE',
  'Cill Dara': 'Kill DAR-ah',
  'Loch Garman': 'Luk GAR-man',
  'Port Láirge': 'Port LAW-rig-eh',
  'Cill Chainnigh': 'Kill HAN-ig',
  'Doire': 'DER-ah',
  'Ráth Luirc': 'RAW Lirk',
  'An Uaimh': 'An OO-iv',
  'Mullach Íde': 'MULL-uck EE-deh',
  'Dalkey': 'DAWK-ee',
  'Shankill': 'SHANK-ill',
  'Balbriggan': 'bal-BRIG-an',
  'Malahide': 'MAL-ah-hide',

  // Counties
  'Laois': 'LEESH',
  'Offaly': 'OFF-ah-lee',
  'Meath': 'MEETH',
  'Louth': 'LOWTH',
  'Sligo': 'SLY-go',
  'Leitrim': 'LEE-trim',
  'Roscommon': 'ross-COMMON',
  'Longford': 'LONG-ford',
  'Westmeath': 'west-MEETH',
  'Monaghan': 'MON-ah-han',
  'Cavan': 'KAV-an',
  'Fermanagh': 'fer-MAN-ah',
  'Tyrone': 'tih-RONE',
  'Armagh': 'ar-MAW',
  'Antrim': 'AN-trim',
  'Down': 'DOWN',
  'Derry': 'DER-ee',
  'Donegal': 'DUN-ee-gall',

  // Provinces and regions
  'Leinster': 'LEN-ster',
  'Munster': 'MUN-ster',
  'Connacht': 'CON-ukt',
  'Ulster': 'UL-ster',
  'Connemara': 'CON-eh-MAR-ah',
  'Burren': 'BUR-en',

  // Organisations
  'Garda Síochána': 'GAR-dah shee-oh-KAW-nah',
  'Gardaí': 'gar-DEE',
  'PSNI': 'P-S-N-I',
  'RTÉ': 'R-T-AY',
  'TG4': 'T-G KWAT-her',
  'GAA': 'G-A-A',
  'Cumann Lúthchleas Gael': 'KUM-an LOO-kless GALE',
  'Áras an Uachtaráin': 'AW-russ an OOK-tah-rawn',
  'Leinster House': 'LEN-ster House',

  // Sports terms
  'hurling': 'HUR-ling',
  'camogie': 'kah-MOH-gee',
  'Croke Park': 'CROKE Park',
  'Páirc an Chrócaigh': 'PORK an KROE-kig',
  'Aviva': 'ah-VEE-vah',
  'Thomond Park': 'TUM-und Park',

  // Common Irish-language phrases in news
  'as Gaeilge': 'ass GALE-gah',
  'Gaeltacht': 'GALE-tukt',
  'ceann comhairle': 'KYANN KOH-er-leh',
  'cathaoirleach': 'kah-HEER-luck',
  'comhairle': 'KOH-er-leh',

  // International names commonly mispronounced
  'Macron': 'mak-ROHN',
  'Scholz': 'SHOLTZ',
  'Zelenskyy': 'zeh-LEN-skee',
  'Orbán': 'OR-bahn',
  'Tusk': 'TOOSK',
  'Netanyahu': 'net-an-YAH-hoo',
  'Khamenei': 'hah-men-AY-ee',
  'Erdoğan': 'AIR-doh-wan',
  'von der Leyen': 'fon dair LYE-en',
  'Barnier': 'bar-NYAY',
  'Lagarde': 'lah-GARD',
  'Starmer': 'STAR-mer',
  'Sunak': 'SOO-nak',
  'Keir': 'KEER',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RETRY_DELAYS = [2000, 5000, 15000];

/**
 * Fetch the current yous.news homepage stories via their internal API.
 * Stories come grouped by section (hero, world, foreign-take, top-headlines, category).
 * We flatten them into a ranked list for the bulletin prompt.
 * Falls back to empty array on failure (Gemini Search fills the gap).
 */
export async function fetchYousNewsStories(): Promise<BulletinStory[]> {
  try {
    const apiUrl = 'https://yous.news/api/internal/homepage-stories';
    const secret = process.env.CRON_SECRET;

    const res = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${secret}`,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const data = await res.json();

    // API returns stories grouped by section - flatten and normalize
    const stories: BulletinStory[] = [];
    const sections = data.sections || data.stories || [];

    // Handle both flat array and grouped object formats
    const items: YousNewsStory[] = Array.isArray(sections)
      ? sections
      : Object.values(sections).flat() as YousNewsStory[];

    for (const item of items) {
      if (item.headline) {
        stories.push({
          headline: item.headline,
          blurb: item.blurb || item.fill || '',
          category: item.category || 'General',
          source: item.source_name || item.sourceName || '',
          reportedAt: item.event_published_at || item.publishedAt || '',
        });
      }
    }

    return stories;
  } catch {
    // API not available, fall through
  }

  return [];
}

// Shape of a story from yous.news /api/internal/homepage-stories
interface YousNewsStory {
  headline: string;
  blurb?: string;
  fill?: string;
  category?: string;
  source_name?: string;
  sourceName?: string;
  source_url?: string;
  event_published_at?: string;
  publishedAt?: string;
  rank?: number;
}

/**
 * Fetch recent bulletin scripts from yous.news for continuity context.
 * Response: { bulletins: [{ date, hour, script, duration_seconds, created_at }] }
 */
export async function fetchRecentBulletins(limit = 3): Promise<RecentBulletin[]> {
  try {
    const secret = process.env.CRON_SECRET;
    const res = await fetch(
      `https://yous.news/api/internal/recent-bulletins?limit=${limit}&lang=en`,
      {
        headers: { 'Authorization': `Bearer ${secret}` },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const bulletins = data.bulletins || [];

    return bulletins.map((b: { script: string; created_at?: string; date?: string; hour?: string }) => ({
      script: b.script,
      generated_at: b.created_at || `${b.date}T${b.hour}:00:00Z`,
    }));
  } catch {
    // Endpoint not available, continue without context
  }

  return [];
}

/**
 * Generate the bulletin script via Gemini Flash with Google Search grounding.
 */
export async function generateBulletinScript(
  genAI: GoogleGenAI,
  stories: BulletinStory[],
  recentBulletins: RecentBulletin[],
  currentHour: string,
): Promise<BulletinResult | null> {
  const now = new Date();
  const irishTime = now.toLocaleString('en-IE', {
    timeZone: 'Europe/Dublin',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const storiesContext = stories.length > 0
    ? `\n\nCURRENT YOUS.NEWS HOMEPAGE STORIES (use these as your primary source):\n${stories.map((s, i) =>
        `${i + 1}. [${s.category}] ${s.headline}: ${s.blurb} (Source: ${s.source})`
      ).join('\n')}`
    : '';

  const bulletinContext = recentBulletins.length > 0
    ? `\n\nLAST ${recentBulletins.length} BULLETIN SCRIPTS (avoid repeating the same lead or transitions):\n${recentBulletins.map((b, i) =>
        `--- Bulletin ${i + 1} (${b.generated_at}) ---\n${b.script}`
      ).join('\n\n')}`
    : '';

  const prompt = `You are the newsreader for yous.news, Ireland's free news service. You are an Irish woman named Emily - warm, authoritative, conversational. You read the hourly bulletin that airs at the top of every hour on yous.news.

TIME NOW: ${irishTime} (Irish time, ${currentHour}:00)
${storiesContext}
${bulletinContext}

TASK: Write a 2-minute news bulletin script (approximately 300 words spoken at broadcast pace). Use Google Search to verify and enrich the stories with the very latest facts.

BULLETIN STRUCTURE (strict order):
1. OPENER (5 seconds): "From yous.news, here is the news at ${currentHour} o'clock." Then the date.
2. LEAD STORY (40 seconds, ~65 words): The single biggest story right now - could be Irish or world news. Lead with the hardest news fact. Include specific names, numbers, places.
3. THREE IRELAND-LINKED STORIES (20 seconds each, ~35 words each): Different categories. Each starts with a category anchor ("In politics...", "On the business front...", "In sport..."). Tight, punchy, one key fact per story.
4. LIGHT CLOSER (20 seconds, ~35 words): Human interest, quirky, or heartwarming Irish story. The "and finally..." segment. Should make the listener smile.
5. SIGN-OFF (5 seconds): "That is the news from yous.news. Updates on the hour, every hour."

WRITING RULES:
- Write for the EAR, not the eye. Short sentences. Active voice. Present tense.
- Use contractions naturally: "Ireland's", "there's", "it's".
- NO em dashes. Use full stops or commas.
- NO lists or bullet points in the spoken text.
- Numbers: say "twelve million euro" not "€12m". Say "two hundred" not "200".
- Ages: "a man in his thirties" not "a 30-year-old man".
- Attribution: "according to the Irish Times" or "RTÉ reports".
- Transitions between stories should feel natural, not mechanical. Vary them.
- If previous bulletins covered the same stories, lead with what's NEW or CHANGED.
- The tone is Morning Ireland meets Monocle - informed, warm, no sensationalism.
- Reference the time of day naturally if appropriate ("this morning", "overnight", "this afternoon").

PRONUNCIATION GUIDE:
For ANY proper noun that might be mispronounced by text-to-speech (Irish names, places, Gaeilge terms, international names), include it in the pronunciations dictionary.
Format: the exact text as written in the script maps to a phonetic guide.
Check the script for EVERY proper noun and add pronunciation if there's any ambiguity.

Return ONLY valid JSON (no markdown fences):
{
  "script": "From yous.news, here is the news at ${currentHour} o'clock...",
  "pronunciations": {
    "Taoiseach": "TEE-shuck",
    "Dún Laoghaire": "Dun LEER-ee"
  },
  "story_count": 5,
  "lead_category": "Politics"
}`;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const response = await genAI.models.generateContent({
        model: AI_MODELS.GEMINI_FLASH,
        contents: prompt,
        config: {
          temperature: 0.6,
          maxOutputTokens: 2000,
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text?.trim();
      if (!text) continue;

      const jsonStr = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        parsed = repairBulletinJson(jsonStr);
      }

      if (parsed?.script) {
        // Merge static dictionary into dynamic pronunciations
        const mergedPronunciations = { ...IRISH_PHONETICS };
        if (parsed.pronunciations && typeof parsed.pronunciations === 'object') {
          Object.assign(mergedPronunciations, parsed.pronunciations);
        }

        // Filter to only pronunciations for terms that appear in the script
        const relevantPronunciations: Record<string, string> = {};
        for (const [term, phonetic] of Object.entries(mergedPronunciations)) {
          if (parsed.script.includes(term)) {
            relevantPronunciations[term] = phonetic;
          }
        }

        return {
          script: cleanBulletinText(parsed.script),
          pronunciations: relevantPronunciations,
          story_count: parsed.story_count || 5,
          generated_at: now.toISOString(),
          hour: currentHour,
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < RETRY_DELAYS.length && (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED'))) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      throw err;
    }
  }

  return null;
}

function repairBulletinJson(text: string): { script?: string; pronunciations?: Record<string, string>; story_count?: number } | null {
  const scriptMatch = text.match(/"script"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
  if (scriptMatch?.[1]) {
    const script = scriptMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');

    // Try to extract pronunciations
    let pronunciations: Record<string, string> = {};
    const pronMatch = text.match(/"pronunciations"\s*:\s*\{([^}]*)\}/);
    if (pronMatch?.[1]) {
      try {
        pronunciations = JSON.parse(`{${pronMatch[1]}}`);
      } catch {
        // Parse individual entries
        const entries = pronMatch[1].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g);
        for (const entry of entries) {
          pronunciations[entry[1]] = entry[2];
        }
      }
    }

    return { script, pronunciations, story_count: 5 };
  }
  return null;
}

function cleanBulletinText(text: string): string {
  return text
    .replace(/\u2014/g, ', ')   // em dash to comma
    .replace(/\u2013/g, '-')    // en dash to hyphen
    .replace(/\s{2,}/g, ' ')    // collapse double spaces
    .trim();
}
