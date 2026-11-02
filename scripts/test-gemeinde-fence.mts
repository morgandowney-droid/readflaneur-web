import { dropOtherGemeindeSections } from '../src/lib/place-boundary';
let fail = 0;
const check = (name: string, ok: boolean) => { console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) fail++; };
const stolberg = `Guten Morgen, Stolberg.

[[Weihnachtsmarkt naht]]

Die beliebten Kupferstädter Weihnachtstage finden wieder statt. Für diejenigen, die ein wenig weiter fahren, läuft der Aachener Weihnachtsmarkt vom 20. November.

[[Freie Straßen in Monschau]]

Für alle, die regelmäßig nach Monschau unterwegs sind, gibt es gute Nachrichten. Die K 2 ist offen.

Schönen Tag.`;
const r = dropOtherGemeindeSections(stolberg, 'nrw-stolberg');
check('Monschau section dropped', r.dropped.includes('Monschau') && !r.text.includes('Monschau'));
check('Kupferstadt section with a passing Aachen mention kept', r.text.includes('Kupferstädter Weihnachtstage'));
check('sign-off kept', r.text.trim().endsWith('Schönen Tag.'));
const inden = `Guten Morgen.

[[Ein Campingplatz zu verkaufen]]

Hier eine ungewöhnliche Gelegenheit: Der Jugendzeltplatz Finkenheide in Hürtgenwald-Kleinhau sucht einen neuen Besitzer.

[[Unternehmerin geehrt]]

Melody Sitta aus Inden erhielt den ersten Platz.`;
const r2 = dropOtherGemeindeSections(inden, 'nrw-inden');
check('Hürtgenwald section dropped from Inden', r2.dropped.includes('Hürtgenwald'));
check('Inden section kept', r2.text.includes('Melody Sitta'));
const r3 = dropOtherGemeindeSections(stolberg, 'milan-brera');
check('unfenced edition untouched', r3.dropped.length === 0);
const esch = `[[Stolberg und Eschweiler]]\n\nEschweiler und Stolberg teilen sich einen neuen Radweg.`;
check('own place in header keeps section', dropOtherGemeindeSections(esch, 'nrw-eschweiler').dropped.length === 0);
process.exit(fail ? 1 : 0);
