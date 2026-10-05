// npx tsx scripts/test-archive-names.mts
import { searchNames, isForeignSite, isListingSite, councilQuery, type ArchiveArea } from '../src/lib/archive/sources';

const area = (name: string, members: string[] = [], extra: Partial<ArchiveArea> = {}): ArchiveArea =>
  ({ id: 'x', name, kind: 't', country: 'United Kingdom', population: 1, lat: 0, lng: 0, members: members.map((n) => ({ name: n, qualified: n, pop: 1 })), ...extra }) as ArchiveArea;
let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}${ok ? '' : ` (want ${JSON.stringify(want)})`}`);
};

eq('NYC hyphen list', searchNames(area('Upper West Side-Manhattan Valley')), ['Upper West Side', 'Manhattan Valley']);
eq('AU spaced hyphen', searchNames(area('Pennant Hills - Cheltenham')), ['Pennant Hills', 'Cheltenham']);
eq('and nearby + brackets', searchNames(area('Kingston (ACT) and nearby', ['Kingston (ACT)', 'Barton'])), ['Kingston', 'Barton']);
eq('directional suffix', searchNames(area('Galway City East')), ['Galway City']);
eq('Carrick-on-Shannon whole', searchNames(area('Carrick-on-shannon')), ['Carrick-on-shannon']);
eq('Pen-y-groes whole', searchNames(area('Bethesda, Pen-y-groes, Tal-y-sarn')), ['Bethesda', 'Pen-y-groes', 'Tal-y-sarn']);
eq('Stratford-upon-Avon whole', searchNames(area('Stratford-upon-Avon')), ['Stratford-upon-Avon']);
eq('lowercase Irish pair', searchNames(area('Firhouse-bohernabreena')), ['Firhouse', 'bohernabreena']);
eq('German hyphen name stays whole', searchNames(area('Baden-Baden', [], { country: 'Germany' })), ['Baden-Baden']);
eq('German district pair stays whole', searchNames(area('Rumeln-Kaldenhausen', [], { country: 'Germany' })), ['Rumeln-Kaldenhausen']);
eq('und Umgebung', searchNames(area('Timmerlah und Umgebung', ['Timmerlah', 'Lamme'])), ['Timmerlah', 'Lamme']);
eq('South prefix kept', searchNames(area('South Bermondsey')), ['South Bermondsey']);

eq('Dorset paper in NZ edition is foreign', isForeignSite('https://www.dorsetecho.co.uk/news/1', 'New Zealand'), true);
eq('Stuff in NZ edition is local', isForeignSite('https://www.stuff.co.nz/a', 'New Zealand'), false);
eq('Irish site in UK edition is local', isForeignSite('https://www.irishnews.com/x', 'United Kingdom'), false);
eq('.ie in UK edition is local', isForeignSite('https://www.rte.ie/x', 'United Kingdom'), false);
eq('Australian site in Irish edition is foreign', isForeignSite('https://www.northernstar.com.au/x', 'Ireland'), true);
eq('.com is not judged', isForeignSite('https://www.nytimes.com/x', 'New Zealand'), false);

eq('NZ council query', councilQuery(area('St Albans', [], { kreis: 'Christchurch City', country: 'New Zealand' })), 'Christchurch');
eq('AU council query', councilQuery(area('Bardia', [], { kreis: 'Campbelltown (NSW)', country: 'Australia' })), 'Campbelltown');
eq('NYC borough carries state', councilQuery(area('Harlem', [], { kreis: 'Manhattan', land: 'New York', country: 'United States' })), 'Manhattan New York');
eq('German city district uses city', councilQuery(area('Rheinheim', [], { city: 'Duisburg', kreis: 'Duisburg', country: 'Germany' })), 'Duisburg');

eq('realestate.com.au is a listing site', isListingSite('https://www.realestate.com.au/property-house-qld-baringa-1'), true);
eq('a news site is not', isListingSite('https://www.sunshinecoastnews.com.au/x'), false);

console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
