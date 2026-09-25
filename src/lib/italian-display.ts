/**
 * Italian display helpers shared by the GEDI morning email and the editor
 * desk. The Look Ahead listing is stored in English on purpose so its lines
 * still parse (translation-service.ts strips it before translating), which
 * left English event names, weekdays and 12-hour times inside Italian pages.
 * These turn a stored event into what an Italian local paper would print.
 */
import { GoogleGenAI } from '@google/genai';
import { AI_MODELS } from '@/config/ai-models';
import { recordGeminiCall } from '@/lib/ai-cost';

/** City names as an Italian reader writes them. */
export const ITALIAN_CITY: Record<string, string> = {
  Milan: 'Milano', Rome: 'Roma', Sicily: 'Sicilia', Florence: 'Firenze', Naples: 'Napoli', Turin: 'Torino', Venice: 'Venezia',
  Genoa: 'Genova', Padua: 'Padova', Syracuse: 'Siracusa',
};

export function italianCity(city: string): string {
  return ITALIAN_CITY[city] || city;
}

/** "10:30 AM to 7:30 PM" becomes "10:30-19:30"; anything else passes through. */
export function italianTime(time: string | null | undefined): string {
  if (!time) return '';
  return time
    .replace(/\b(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?/g, (_, h, m, ap) => {
      let hour = Number(h) % 12;
      if (/p/i.test(ap)) hour += 12;
      return `${String(hour).padStart(2, '0')}:${m || '00'}`;
    })
    .replace(/\s+(?:to|until)\s+/gi, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\ball day\b/i, 'tutto il giorno')
    .trim();
}

/** A venue address without the country and with the Italian city name. */
export function italianPlace(place: string | null | undefined): string {
  if (!place) return '';
  let p = place.replace(/,\s*Italy\s*$/i, '');
  for (const [en, it] of Object.entries(ITALIAN_CITY)) p = p.replace(new RegExp(`\\b${en}\\b`, 'g'), it);
  return p.trim();
}

/** "ven 25 set" from YYYY-MM-DD. */
export function italianDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const nameCache = new Map<string, string>();

/**
 * Event names into Italian, all names in one Gemini Flash call. Titles of
 * works, venue and organisation names stay as they are. Any failure, or an
 * answer of the wrong shape, keeps the English names. Results are cached per
 * process so reloading the desk does not pay again.
 */
export async function translateEventNames(names: string[], operation = 'italian_event_names'): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  const missing = Array.from(new Set(names.filter((n) => n && !nameCache.has(n))));
  if (missing.length && apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = [
        'Translate these event names from a local events listing into natural Italian, as an Italian local paper would print them.',
        'Keep unchanged: proper names, titles of plays, operas, films, songs, books and exhibitions, venue names, organisation and brand names, and anything already in Italian.',
        'Translate only the descriptive words (for example "Closing Day" becomes "ultimo giorno", "Tribute to" becomes "Tributo a").',
        'A generic word next to a title, such as "Exhibition", "exhibition", "Show", "Concert" or "Talk", is description, not part of the title: translate it and place it the Italian way, for example "Spectrum Exhibition" becomes "mostra Spectrum" and "The Sun of Metaphysics exhibition" becomes "mostra The Sun of Metaphysics".',
        'Never add information. Never use em dashes. Return JSON: {"names": [...]} with exactly one entry per input, in the same order.',
        '',
        JSON.stringify(missing),
      ].join('\n');
      const result = await ai.models.generateContent({
        model: AI_MODELS.GEMINI_FLASH,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.1, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
      });
      recordGeminiCall(result, { operation, kind: 'generation', model: AI_MODELS.GEMINI_FLASH });
      const parsed = JSON.parse((result.text || '').trim()) as { names?: unknown };
      const out = Array.isArray(parsed?.names) ? parsed.names : null;
      if (out && out.length === missing.length && out.every((n) => typeof n === 'string' && n.trim())) {
        (out as string[]).forEach((n, i) => {
          const clean = n.replace(/\s*[—–]\s*/g, ' - ').trim();
          nameCache.set(missing[i], clean.charAt(0).toUpperCase() + clean.slice(1));
        });
      }
    } catch (err) {
      console.error('[italian-display] event name translation failed:', err instanceof Error ? err.message : err);
    }
  }
  return names.map((n) => nameCache.get(n) || n);
}
