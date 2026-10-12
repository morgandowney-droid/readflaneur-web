// npx tsx scripts/test-event-times-and-notes.mts
import { stripSuspectTimes, clearSuspectEventTimes, utcOffsetHours } from '../src/lib/event-times';
import { stripWorkingNotes } from '../src/lib/working-notes';
import { formatEventListing } from '../src/lib/look-ahead-events';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`}`);
};

const CHI = 'America/Chicago';
eq('Chicago offset in October', utcOffsetHours(CHI, new Date('2026-10-12T12:00:00Z')), -5);
eq('Stockholm offset in October', utcOffsetHours('Europe/Stockholm', new Date('2026-10-12T12:00:00Z')), 2);

// Prose: the Shreveport parade line
eq('parade at 11:00 PM loses its time',
  stripSuspectTimes('The Christmas Festival and Parade is on Friday, October 16 at 11:00 PM. Bring the kids.', CHI).text,
  'The Christmas Festival and Parade is on Friday, October 16. Bring the kids.');
eq('range from 11 PM to 1 AM removed',
  stripSuspectTimes('The Key Exchange is at Gigi\'s Event Center from 11:00 PM to 1:00 AM. Tickets are $21.', CHI).text,
  'The Key Exchange is at Gigi\'s Event Center. Tickets are $21.');
eq('evening time untouched',
  stripSuspectTimes('WWE Monday Night Raw is at Brookshire Grocery Arena tonight at 6:30 PM.', CHI).text,
  'WWE Monday Night Raw is at Brookshire Grocery Arena tonight at 6:30 PM.');
eq('burlesque night keeps 11 PM',
  stripSuspectTimes('A burlesque night takes over The Korner Lounge at 11:00 PM.', CHI).text,
  'A burlesque night takes over The Korner Lounge at 11:00 PM.');
eq('nightlife in one sentence does not protect the next',
  stripSuspectTimes('The bar opens late. The parade starts at 11 PM.', CHI).text,
  'The bar opens late. The parade starts.');
eq('Europe untouched',
  stripSuspectTimes('The concert starts at 23:00.', 'Europe/Madrid').text,
  'The concert starts at 23:00.');
eq('headers untouched',
  stripSuspectTimes('[[Parade at 11 PM]]\nText.', CHI).text,
  '[[Parade at 11 PM]]\nText.');
eq('morning event at 7:30 AM untouched',
  stripSuspectTimes('Donuts & Dyslexia starts at 7:30 AM.', CHI).text,
  'Donuts & Dyslexia starts at 7:30 AM.');

eq('afternoon range 1:30-3:30 PM untouched',
  stripSuspectTimes('Candle Making on October 15 from 1:30-3:30 PM at the museum.', 'America/Denver').text,
  'Candle Making on October 15 from 1:30-3:30 PM at the museum.');
eq('garbled 5:30 am to 7:30 pm meeting loses its time',
  stripSuspectTimes('A public safety conversation is on October 21 from 5:30 am to 7:30 pm.', CHI).text,
  'A public safety conversation is on October 21.');
eq('incident time kept',
  stripSuspectTimes('A gunfight broke out on August 31 at 2:09 a.m. One man was killed.', 'America/Denver').text,
  'A gunfight broke out on August 31 at 2:09 a.m. One man was killed.');
eq('24-hour 23:00 in prose removed',
  stripSuspectTimes('The parade starts at 23:00 on Friday.', CHI).text,
  'The parade starts on Friday.');

// Structured events
const ev = clearSuspectEventTimes([
  { date: '2026-10-16', day_label: 'Friday', name: 'Shreveport Family Christmas Festival', time: '23:00' },
  { date: '2026-10-16', day_label: 'Friday', name: 'Comedy at the Club', time: '23:00' },
  { date: '2026-10-16', day_label: 'Friday', name: 'Mudbugs v IceRays', time: '19:00' },
  { date: '2026-10-16', day_label: 'Friday', name: 'Early parade', time: '11:00 PM - 1:00 AM' },
], CHI);
eq('listing: parade cleared, club kept, evening kept', ev.events.map((e) => e.time), [null, '23:00', '19:00', null]);
eq('listing: Stockholm untouched', clearSuspectEventTimes([{ date: '2026-10-16', day_label: 'Friday', name: 'Concert', time: '23:00' }], 'Europe/Stockholm').cleared, []);

// The listing date check (missing backslashes emptied every listing from 30 Sep)
eq('listing renders a real date',
  formatEventListing([{ date: '2026-10-14', day_label: 'Wednesday', name: 'Test concert', time: '19:00' }], '2026-10-12', 'Shreveport').includes('Test concert'),
  true);
eq('listing still drops an invalid date',
  formatEventListing([{ date: 'TBD', day_label: '', name: 'Undated opening' }], '2026-10-12', 'Shreveport'),
  '');

// Working notes
eq('Shreveport leak keeps the main clause',
  stripWorkingNotes("[[Gumbo Day]]\nIt's National Gumbo Day. While specific specials for the eight local restaurants mentioned in the prompt couldn't be independently verified, it's the perfect day to visit your favorite Cajun or Creole spot for a bowl.").text,
  "[[Gumbo Day]]\nIt's National Gumbo Day. It's the perfect day to visit your favorite Cajun or Creole spot for a bowl.");
eq('whole sentence dropped',
  stripWorkingNotes('The market opens Saturday. Opening hours were not specified in the sources. Bring cash.').text,
  'The market opens Saturday. Bring cash.');
eq('first-person verify dropped',
  stripWorkingNotes('The cafe reopens Monday. I could not verify the new menu.').text,
  'The cafe reopens Monday.');
eq('section emptied by removal loses its header',
  stripWorkingNotes('[[Market]]\nBased on the provided information, details are thin.\n\n[[Parade]]\nThe parade is Friday.').text,
  '[[Parade]]\nThe parade is Friday.');
eq('clean text unchanged',
  stripWorkingNotes('[[Council]]\nThe council said the claim could not be independently verified by police.').text,
  '[[Council]]\nThe council said the claim could not be independently verified by police.');
eq('a URL containing "the-prompt" is not a leak',
  stripWorkingNotes('Read [the review](https://example.com/the-prompt-cafe). It is good.').text,
  'Read [the review](https://example.com/the-prompt-cafe). It is good.');
eq('pre-existing empty header kept',
  stripWorkingNotes('[[Today]]\n\n[[Market]]\nThe market is on. As listed in the prompt, it is free.').text,
  '[[Today]]\n\n[[Market]]\nThe market is on. It is free.');

console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
