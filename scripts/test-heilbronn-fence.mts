import { dropOtherGemeindeSections } from '../src/lib/place-boundary';
const t = `Guten Morgen, Künzelsau.\n\n[[Neue Brücke in Öhringen]]\nIn Öhringen wird die Brücke gesperrt.\n\n[[Würth erweitert in Gaisbach]]\nDer Konzern baut in Gaisbach, sagte die Heilbronner Stimme.\n\nBis morgen.`;
const r = dropOtherGemeindeSections(t, 'bw-kuenzelsau');
const ok = (n: string, c: boolean) => console.log(c ? 'PASS' : 'FAIL', n);
ok('Öhringen dropped from Künzelsau', r.dropped.includes('Öhringen'));
ok('Gaisbach section kept', r.text.includes('Gaisbach'));
const e = dropOtherGemeindeSections(`[[Markt in Sinsheim]]\nIn Sinsheim beginnt der Markt.\n\n[[Kleingartach feiert]]\nIn Kleingartach feiert man.`, 'bw-eppingen');
ok('Sinsheim dropped from Eppingen', e.dropped.length === 1 && e.text.includes('Kleingartach'));
// 3 Nov: Beilstein's first brief kept an exhibition at the Eppingen town hall, because the link URL carried "Beilstein".
const b = dropOtherGemeindeSections(`Good morning.\n\n[[Historic Albums on Show]]\nFor something different, the [Galerie im Eppinger Rathaus](https://www.google.com/search?q=Galerie%20im%20Eppinger%20Rathaus%20Beilstein%20Landkreis%20Heilbronn) shows old poetry albums.\n\n[[Advent Market]]\nThe [Beilstein Advent Market](https://www.google.com/search?q=Beilstein) is confirmed.\n\nSee you tomorrow.`, 'bw-beilstein');
ok('Eppinger section dropped from Beilstein despite the link URL', b.dropped.length === 1 && b.text.includes('Advent Market') && !b.text.includes('Eppinger'));
const k = dropOtherGemeindeSections(`[[New Face at the Top]]\nThere's a new face in the Kreis Düren administration.\n\n[[Roadworks]]\nA quick update for those navigating the roadworks in Düren.`, 'nrw-inden');
ok('Kreis Düren kept, Düren town dropped', k.dropped.length === 1 && k.text.includes('New Face'));
