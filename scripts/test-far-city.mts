// Tests for dropFarCitySections / venueInFarCity (src/lib/place-boundary.ts).
// Run: npx tsx scripts/test-far-city.mts
import { dropFarCitySections, venueInFarCity } from '../src/lib/place-boundary';

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
}

// The case that shipped: Delicias, Zaragoza, 8 Oct 2026.
const delicias = `Buenos días, Delicias.

[[The Gastronomic Countdown]]
PilarGastroWeek starts Saturday in Zaragoza.

[[A Trip to a Galaxy Far, Far Away]]
For those willing to venture beyond the neighborhood, a rather large exhibition is currently running at Espacio Delicias in Madrid.

[[Market]]
Mercado Delicias is open at 9.`;
const r = dropFarCitySections(delicias, 'Zaragoza');
check('Delicias: Madrid section dropped', r.dropped, ['Madrid']);
check('Delicias: other sections kept', r.text.includes('[[Market]]') && r.text.includes('[[The Gastronomic Countdown]]'), true);
check('Delicias: greeting kept', r.text.startsWith('Buenos días, Delicias.'), true);
check('Delicias: Madrid story gone', r.text.includes('Espacio Delicias'), false);

// The real one had the Madrid story last, with the sign-off after it.
const lastSection = `Buenos días, Delicias.

[[Market]]
Mercado Delicias is open at 9.

[[A Trip to a Galaxy Far, Far Away]]
An exhibition is currently running at Espacio Delicias in Madrid.

Hasta luego.`;
const r2 = dropFarCitySections(lastSection, 'Zaragoza');
check('last section dropped', r2.dropped, ['Madrid']);
check('sign-off kept', r2.text.trim().endsWith('Hasta luego.'), true);
check('story gone', r2.text.includes('Espacio Delicias'), false);

check('own city is home', venueInFarCity('at the Paraninfo in Zaragoza', 'Zaragoza'), null);
check('edition city not in table: untouched (Naas -> Dublin)', venueInFarCity('a show at the Gaiety in Dublin', 'Naas'), null);
check('Limerick -> Dublin is far', venueInFarCity('a show at the Gaiety in Dublin', 'Limerick'), 'Dublin');
check('Düsseldorf -> Köln is near (about 35 km)', venueInFarCity('a concert at the Philharmonie in Köln', 'Düsseldorf'), null);
check('city named without a venue is not a venue', venueInFarCity('trains to Madrid run late today', 'Zaragoza'), null);
check('no headers: untouched', dropFarCitySections('at X in Madrid', 'Zaragoza').dropped, []);

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('all passed');
