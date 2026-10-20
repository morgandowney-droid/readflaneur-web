// Storage keys for source snapshots must be ASCII: Supabase rejected
// "oslo-grunerløkka/<date>/<sha1>.html" as an invalid key and every
// archive-article-sources run from 25 Sep to 20 Oct 2026 failed on it.
// Run: npx tsx scripts/test-storage-safe-id.mts
import { snapshotKey, snapshotFolder, storageSafeId } from '../src/lib/source-archive';

const cases: Array<[string, string]> = [
  ['oslo-grunerløkka', 'oslo-grunerlokka'],
  ['nyc-tribeca', 'nyc-tribeca'],
  ['zaragoza-casco-histórico', 'zaragoza-casco-historico'],
  ['wien-währing', 'wien-wahring'],
  ['aarhus-ø', 'aarhus-o'],
  ['koeln-straße', 'koeln-strasse'],
  ['x y/z', 'x-y-z'],
];
let bad = 0;
for (const [input, expected] of cases) {
  const got = storageSafeId(input);
  if (got !== expected) { bad++; console.log('FAIL', input, '->', got, 'expected', expected); }
}
const key = snapshotKey('oslo-grunerløkka', '2026-10-19', 'https://example.com/a');
if (!/^[A-Za-z0-9._/-]+$/.test(key)) { bad++; console.log('FAIL key not ascii:', key); }
if (snapshotFolder('oslo-grunerløkka', '2026-10-19') !== 'oslo-grunerlokka/2026-10-19') { bad++; console.log('FAIL folder'); }
console.log(bad ? `${bad} failures` : `all ${cases.length + 2} checks pass: ${key}`);
process.exit(bad ? 1 : 0);
