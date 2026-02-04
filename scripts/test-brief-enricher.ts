#!/usr/bin/env npx tsx
/**
 * Test script for brief enricher
 *
 * Usage:
 *   npx tsx scripts/test-brief-enricher.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { enrichBrief, formatEnrichedBriefAsMarkdown } from '../src/lib/brief-enricher';

const TEST_BRIEF = `PopUp Bagels opens February 6, perfect for your morning fix.
Jay's Pizza aims for a February debut nearby. Amazon Go at Brookfield Place closed for good yesterday.
Etiq, a gemstone spot, just debuted on N. Moore. Issey Miyake's temporary store pops up there too.
Enfants Riches Déprimés plans a flagship in the hood.
Fresh plans drop today for converting the Sofia Brothers warehouse on Franklin Street.
Weigh in on City Hall Park's east plaza redesign. Events are quiet, but Duane Park's Groundhog shindig looms Monday.`;

async function main() {
  console.log('='.repeat(70));
  console.log('BRIEF ENRICHER TEST');
  console.log('='.repeat(70));
  console.log();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  console.log('Original Brief:');
  console.log('-'.repeat(50));
  console.log(TEST_BRIEF);
  console.log('-'.repeat(50));
  console.log();

  console.log('Enriching brief (this may take 60-90 seconds)...');
  console.log('Note: Tribeca Citizen is BLOCKED for Tribeca');
  console.log();

  const startTime = Date.now();

  try {
    const result = await enrichBrief(
      TEST_BRIEF,
      'Tribeca',
      'tribeca',
      'New York',
      { date: 'Monday, February 2, 2026' }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nCompleted in ${elapsed}s\n`);

    // Output as Markdown (like Gemini)
    console.log('='.repeat(70));
    console.log('ENRICHED OUTPUT (Markdown)');
    console.log('='.repeat(70));
    console.log();
    console.log(formatEnrichedBriefAsMarkdown(result));

    // Summary stats
    console.log('='.repeat(70));
    console.log('STATISTICS');
    console.log('='.repeat(70));
    const totalStories = result.categories.reduce((sum, cat) => sum + cat.stories.length, 0);
    const storiesWithSources = result.categories.reduce(
      (sum, cat) => sum + cat.stories.filter(s => s.source !== null).length,
      0
    );
    const totalSources = result.categories.reduce(
      (sum, cat) => sum + cat.stories.filter(s => s.source).length +
                    cat.stories.filter(s => s.secondarySource).length,
      0
    );

    console.log(`  Categories: ${result.categories.length}`);
    console.log(`  Total stories: ${totalStories}`);
    console.log(`  Stories with sources: ${storiesWithSources} (${((storiesWithSources / totalStories) * 100).toFixed(0)}%)`);
    console.log(`  Total sources found: ${totalSources}`);
    console.log(`  Model: ${result.model}`);
    console.log(`  Blocked domains: ${result.blockedDomains.join(', ') || 'none'}`);
    console.log();

    // Also output raw JSON for inspection
    console.log('='.repeat(70));
    console.log('RAW JSON');
    console.log('='.repeat(70));
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
