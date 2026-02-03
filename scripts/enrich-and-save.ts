#!/usr/bin/env npx tsx
/**
 * Enrich a brief and save to database
 * Usage: npx tsx scripts/enrich-and-save.ts <brief-id> <neighborhood-name> <neighborhood-slug> <city> <country>
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { enrichBriefWithGemini } from '../src/lib/brief-enricher-gemini';

// Default neighborhoods to enrich
const NEIGHBORHOODS = [
  {
    briefId: '4597a123-cac3-464b-bb42-5091cba969f6',
    name: 'Östermalm',
    slug: 'stockholm-ostermalm',
    city: 'Stockholm',
    country: 'Sweden',
  },
  {
    briefId: '29030ddd-5594-4491-8fb7-0cef830a52ff',
    name: 'Tribeca',
    slug: 'nyc-tribeca',
    city: 'New York',
    country: 'USA',
  },
  {
    briefId: '76cde37b-d657-46d9-ab9e-1fad81662e01',
    name: 'West Village',
    slug: 'nyc-west-village',
    city: 'New York',
    country: 'USA',
  },
];

async function enrichNeighborhood(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  briefId: string,
  name: string,
  slug: string,
  city: string,
  country: string
) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Enriching: ${name}`);
  console.log('='.repeat(60));

  // Get the brief content and generated_at timestamp
  const { data: briefData, error: fetchError } = await supabase
    .from('neighborhood_briefs')
    .select('id, content, generated_at')
    .eq('id', briefId)
    .single();

  if (fetchError || !briefData) {
    console.error(`Failed to fetch brief for ${name}:`, fetchError);
    return;
  }

  const brief = briefData as { id: string; content: string; generated_at: string };
  console.log('Brief content length:', brief.content.length);
  console.log('Brief generated at:', brief.generated_at);
  console.log('Calling Gemini...');

  try {
    const result = await enrichBriefWithGemini(
      brief.content,
      name,
      slug,
      city,
      country,
      {
        // Pass the brief's generation timestamp for correct "today"/"tomorrow" context
        briefGeneratedAt: brief.generated_at,
      }
    );

    console.log('Enrichment complete. Saving to database...');

    // Save to database
    const { error: saveError } = await supabase
      .from('neighborhood_briefs')
      .update({
        enriched_content: result.rawResponse || null,
        enriched_categories: result.categories,
        enriched_at: new Date().toISOString(),
        enrichment_model: result.model,
      })
      .eq('id', briefId);

    if (saveError) {
      console.error('Save error:', saveError);
    } else {
      const storyCount = result.categories.reduce((s, c) => s + c.stories.length, 0);
      const withSources = result.categories.reduce(
        (s, c) => s + c.stories.filter(st => st.source !== null).length, 0
      );
      console.log(`✓ Saved! Categories: ${result.categories.length}, Stories: ${storyCount}, With sources: ${withSources}`);
    }
  } catch (error) {
    console.error(`Error enriching ${name}:`, error);
  }
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  for (const hood of NEIGHBORHOODS) {
    await enrichNeighborhood(
      supabase,
      hood.briefId,
      hood.name,
      hood.slug,
      hood.city,
      hood.country
    );

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n✓ Done!');
}

main().catch(console.error);
