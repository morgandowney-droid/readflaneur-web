#!/usr/bin/env npx tsx
/**
 * Test script for brief source finding
 *
 * Usage:
 *   npx tsx scripts/test-brief-sources.ts
 *
 * Requires ANTHROPIC_API_KEY to be set
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { findSourcesForBrief, parseBriefIntoStories } from '../src/lib/brief-sources';

const TEST_BRIEF = `PopUp Bagels opens February 6, perfect for your morning fix.
Jay's Pizza aims for a February debut nearby. Amazon Go at Brookfield Place closed for good yesterday.
Etiq, a gemstone spot, just debuted on N. Moore. Issey Miyake's temporary store pops up there too.
Enfants Riches Déprimés plans a flagship in the hood.
Fresh plans drop today for converting the Sofia Brothers warehouse on Franklin Street.
Weigh in on City Hall Park's east plaza redesign. Events are quiet, but Duane Park's Groundhog shindig looms Monday.`;

async function main() {
  console.log('='.repeat(60));
  console.log('BRIEF SOURCE FINDER TEST');
  console.log('='.repeat(60));
  console.log();

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY not set in environment');
    process.exit(1);
  }

  console.log('Test Brief:');
  console.log('-'.repeat(40));
  console.log(TEST_BRIEF);
  console.log('-'.repeat(40));
  console.log();

  // Show parsed stories
  console.log('Parsed Stories:');
  const stories = parseBriefIntoStories(TEST_BRIEF);
  stories.forEach((story, i) => {
    console.log(`  ${i + 1}. ${story.slice(0, 70)}...`);
  });
  console.log();

  console.log('Finding sources (this may take 30-60 seconds)...');
  console.log('Note: Tribeca Citizen is BLOCKED for Tribeca');
  console.log();

  const startTime = Date.now();
  const result = await findSourcesForBrief(
    TEST_BRIEF,
    'Tribeca',
    'tribeca',
    'New York',
    { maxStories: 5 }
  );
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`Completed in ${elapsed}s`);
  console.log();
  console.log('='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log();

  for (const story of result.stories) {
    console.log(`STORY: "${story.text.slice(0, 80)}${story.text.length > 80 ? '...' : ''}"`);
    console.log(`  Search: ${story.searchQuery}`);

    if (story.sources.length > 0) {
      console.log(`  Sources Found:`);
      for (const source of story.sources) {
        console.log(`    ✓ [${source.domain}] ${source.title}`);
        console.log(`      ${source.url}`);
      }
    } else {
      console.log(`  No sources found`);
    }
    console.log(`  Google Fallback: ${story.googleSearchUrl}`);
    console.log();
  }

  // Summary
  const storiesWithSources = result.stories.filter(s => s.sources.length > 0).length;
  const totalSources = result.stories.reduce((sum, s) => sum + s.sources.length, 0);

  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Stories processed: ${result.stories.length}`);
  console.log(`  Stories with sources: ${storiesWithSources}`);
  console.log(`  Total sources found: ${totalSources}`);
  console.log(`  Model used: ${result.model}`);
  console.log();
}

main().catch(console.error);
