import { dropOtherGemeindeSections } from '../src/lib/place-boundary';
const t = `Guten Morgen, Künzelsau.\n\n[[Neue Brücke in Öhringen]]\nIn Öhringen wird die Brücke gesperrt.\n\n[[Würth erweitert in Gaisbach]]\nDer Konzern baut in Gaisbach, sagte die Heilbronner Stimme.\n\nBis morgen.`;
const r = dropOtherGemeindeSections(t, 'bw-kuenzelsau');
const ok = (n: string, c: boolean) => console.log(c ? 'PASS' : 'FAIL', n);
ok('Öhringen dropped from Künzelsau', r.dropped.includes('Öhringen'));
ok('Gaisbach section kept', r.text.includes('Gaisbach'));
const e = dropOtherGemeindeSections(`[[Markt in Sinsheim]]\nIn Sinsheim beginnt der Markt.\n\n[[Kleingartach feiert]]\nIn Kleingartach feiert man.`, 'bw-eppingen');
ok('Sinsheim dropped from Eppingen', e.dropped.length === 1 && e.text.includes('Kleingartach'));
