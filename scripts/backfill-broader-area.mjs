/**
 * One-time backfill script: populate broader_area for all active neighborhoods.
 *
 * Uses Gemini Flash to determine the province/county/region for each neighborhood.
 * Run after the migration: node scripts/backfill-broader-area.mjs
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY not set');
  process.exit(1);
}

const GEMINI_MODEL = 'gemini-2.5-flash';
const BATCH_SIZE = 10;
const DELAY_MS = 1000; // 1s between batches to avoid rate limits

async function determineBroaderArea(neighborhoods) {
  const items = neighborhoods.map(n =>
    `- id: "${n.id}", name: "${n.name}", city: "${n.city}", country: "${n.country || 'Unknown'}"`
  ).join('\n');

  const prompt = `For each neighborhood/town below, determine the well-known province, county, or region it belongs to. This will be used as a fallback search term for finding photos on Unsplash, so choose the most recognizable geographic name.

Rules:
- Return the province, county, or well-known region name (e.g., "Seville" for Utrera, "Provence" for Aix-en-Provence, "Tuscany" for Fiesole, "Long Island" for Montauk, "Andalusia" for Malaga)
- For neighborhoods within major well-known cities (e.g., Tribeca in New York, Montmartre in Paris, Shibuya in Tokyo), return null - the city name alone produces good image results
- For small towns that ARE the city (name equals city), always return a broader area
- Choose the most photo-friendly name - "Tuscany" is better than "Province of Florence", "Provence" is better than "Bouches-du-Rhone"
- Return ONLY valid JSON array, no other text

Neighborhoods:
${items}

Return JSON array:
[{"id": "neighborhood-id", "broader_area": "Region Name" or null}, ...]`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('No valid JSON array in Gemini response');
  }

  return JSON.parse(jsonMatch[0]);
}

async function main() {
  // Fetch all active neighborhoods without broader_area
  const { data: neighborhoods, error } = await supabase
    .from('neighborhoods')
    .select('id, name, city, country')
    .eq('is_active', true)
    .is('broader_area', null)
    .order('id');

  if (error) {
    console.error('Failed to fetch neighborhoods:', error);
    process.exit(1);
  }

  console.log(`Found ${neighborhoods.length} neighborhoods without broader_area`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < neighborhoods.length; i += BATCH_SIZE) {
    const batch = neighborhoods.slice(i, i + BATCH_SIZE);
    console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(neighborhoods.length / BATCH_SIZE)} (${batch.map(n => n.name).join(', ')})...`);

    try {
      const results = await determineBroaderArea(batch);

      for (const result of results) {
        if (!result.id) continue;

        if (result.broader_area && result.broader_area !== 'null') {
          const { error: updateError } = await supabase
            .from('neighborhoods')
            .update({ broader_area: result.broader_area })
            .eq('id', result.id);

          if (updateError) {
            console.error(`  Failed to update ${result.id}:`, updateError.message);
            errors++;
          } else {
            console.log(`  ${result.id}: ${result.broader_area}`);
            updated++;
          }
        } else {
          console.log(`  ${result.id}: null (major city)`);
          skipped++;
        }
      }
    } catch (err) {
      console.error(`  Batch error:`, err.message);
      errors += batch.length;
    }

    // Rate limit delay between batches
    if (i + BATCH_SIZE < neighborhoods.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log(`\nDone! Updated: ${updated}, Skipped (major cities): ${skipped}, Errors: ${errors}`);
}

main().catch(console.error);
