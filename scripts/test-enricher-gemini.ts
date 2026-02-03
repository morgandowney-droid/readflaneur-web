#!/usr/bin/env npx tsx
/**
 * Test Gemini-based brief enricher
 *
 * Usage:
 *   npx tsx scripts/test-enricher-gemini.ts           # Test with sample Östermalm brief
 *   npx tsx scripts/test-enricher-gemini.ts --api     # Test via API endpoint
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { enrichBriefWithGemini, formatGeminiEnrichedBriefAsMarkdown } from '../src/lib/brief-enricher-gemini';

const OSTERMALM_BRIEF = `Folks in Östermalm, brace for a frosty thrill today at Kungsträdgården, right on the neighborhood's edge. Östermalms konståkningsklubb is hosting a prova på skating try-out and show from 16:30 to 17:30, perfect for channeling your inner Torvill and Dean amid the ongoing Success at a Gallop light exhibition running through February 28.
Meanwhile, cozy up at Östermalms Saluhall where Bistrot du Passage is earning rave reviews for its high-class French fare in a snug corner.
Development buzz is heating up: Ericssons old offices at Jan Stenbecks torg are transforming into 850 swanky apartments with rooftop terraces and yoga studios, while sales kick off tomorrow (Feb 3) for another big project amid seven key builds slated for 2026.
Recent drama includes a loose dog put down after attacking another on Gyllenstiernsgatan and a fire near Valhallavägen sending one to hospital—stay vigilant, neighbors! No splashy restaurant debuts today, but whispers of a new bakery-cafe by chef Stefan Ekengren this month have us salivating.`;

async function main() {
  console.log('='.repeat(70));
  console.log('GEMINI BRIEF ENRICHER TEST - Östermalm');
  console.log('='.repeat(70));
  console.log();

  if (!process.env.GEMINI_API_KEY) {
    console.error('Error: GEMINI_API_KEY not set');
    process.exit(1);
  }

  console.log('Original Brief:');
  console.log('-'.repeat(50));
  console.log(OSTERMALM_BRIEF.slice(0, 300) + '...');
  console.log('-'.repeat(50));
  console.log();

  console.log('Enriching with Gemini (Google Search grounding)...');
  console.log();

  const startTime = Date.now();

  try {
    const result = await enrichBriefWithGemini(
      OSTERMALM_BRIEF,
      'Östermalm',
      'stockholm-ostermalm',
      'Stockholm',
      'Sweden',
      { date: 'Monday, February 2, 2026' }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nCompleted in ${elapsed}s\n`);

    // Output formatted markdown
    console.log('='.repeat(70));
    console.log('ENRICHED OUTPUT');
    console.log('='.repeat(70));
    console.log();
    console.log(formatGeminiEnrichedBriefAsMarkdown(result));

    // Stats
    if (result.categories.length > 0) {
      const totalStories = result.categories.reduce((sum, cat) => sum + cat.stories.length, 0);
      const withSources = result.categories.reduce(
        (sum, cat) => sum + cat.stories.filter(s => s.source !== null).length, 0
      );
      console.log('='.repeat(70));
      console.log('STATISTICS');
      console.log('='.repeat(70));
      console.log(`  Categories: ${result.categories.length}`);
      console.log(`  Stories: ${totalStories}`);
      console.log(`  With sources: ${withSources} (${((withSources/totalStories)*100).toFixed(0)}%)`);
      console.log(`  Model: ${result.model}`);
    }

    // Also output raw response length
    if (result.rawResponse) {
      console.log(`  Raw response length: ${result.rawResponse.length} chars`);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
