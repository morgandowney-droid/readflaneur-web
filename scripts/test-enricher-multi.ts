#!/usr/bin/env npx tsx
/**
 * Test enricher on multiple neighborhoods
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { enrichBrief, formatEnrichedBriefAsMarkdown } from '../src/lib/brief-enricher';

const BRIEFS = [
  {
    neighborhoodName: 'West Village',
    neighborhoodSlug: 'nyc-west-village',
    city: 'New York',
    content: `Village foodies, rejoice. The team from Elmhurst's late Pata Cafe unveiled Moon And Back, a cozy Thai spot in the West Village that's already drawing crowds. Meanwhile, a slick new women-owned coffee shop by day turns oyster-and-wine haven by night.

Tragic turn yesterday. NYPD dropped body-cam footage of a fatal police shooting in the neighborhood, sparking local chatter.

NYC Restaurant Week heats up through February, so hit West Village haunts on the cheap. Mark calendars for Gooey on the Inside's free cookie bash February 16 too.`,
  },
  {
    neighborhoodName: 'Östermalm',
    neighborhoodSlug: 'stockholm-ostermalm',
    city: 'Stockholm',
    content: `Folks in Östermalm, brace for a frosty thrill today at Kungsträdgården, right on the neighborhood's edge—Östermalms konståkningsklubb is hosting a "prova på" skating try-out and show from 16:30 to 17:30, perfect for channeling your inner Torvill and Dean amid the ongoing "Success at a Gallop" light exhibition running through February 28. Meanwhile, cozy up at Östermalms Saluhall where Bistrot du Passage is earning rave reviews for its high-class French fare in a snug corner.

Development buzz is heating up: Ericssons old offices at Jan Stenbecks torg are transforming into 850 swanky apartments with rooftop terraces and yoga studios, while sales kick off tomorrow (Feb 3) for another big project amid seven key builds slated for 2026.

Recent drama includes a loose dog put down after attacking another on Gyllenstiernsgatan and a fire near Valhallavägen sending one to hospital—stay vigilant, neighbors! No splashy restaurant debuts today, but whispers of a new bakery-cafe by chef Stefan Ekengren this month have us salivating. Quiet Monday, or prime for local lurking?`,
  },
];

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  for (const brief of BRIEFS) {
    console.log('\n' + '='.repeat(70));
    console.log(`ENRICHING: ${brief.neighborhoodName}, ${brief.city}`);
    console.log('='.repeat(70));
    console.log('\nOriginal Brief:');
    console.log('-'.repeat(50));
    console.log(brief.content.slice(0, 300) + '...');
    console.log('-'.repeat(50));

    const startTime = Date.now();

    try {
      const result = await enrichBrief(
        brief.content,
        brief.neighborhoodName,
        brief.neighborhoodSlug,
        brief.city,
        { date: 'Monday, February 2, 2026' }
      );

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\nCompleted in ${elapsed}s\n`);

      // Output markdown
      console.log(formatEnrichedBriefAsMarkdown(result));

      // Stats
      const totalStories = result.categories.reduce((sum, cat) => sum + cat.stories.length, 0);
      const withSources = result.categories.reduce(
        (sum, cat) => sum + cat.stories.filter(s => s.source !== null).length, 0
      );
      console.log(`Stats: ${withSources}/${totalStories} stories with sources (${((withSources/totalStories)*100).toFixed(0)}%)`);
      console.log(`Blocked domains: ${result.blockedDomains.join(', ') || 'none'}`);

    } catch (error) {
      console.error('Error:', error);
    }
  }
}

main().catch(console.error);
