import { untranslatedHeaders } from '../src/lib/translation-service';
const src = `Guten Morgen.\n\n[[Arena Action]]\nThe ARENA...\n\n[[A Campsite Opportunity]]\nHere...\n\n[[Indeland]]\nx`;
const de = `Guten Morgen.\n\n[[Arena Action]]\nDie ARENA...\n\n[[A Campsite Opportunity]]\nHier...\n\n[[Indeland]]\nx`;
const ok = `Guten Morgen.\n\n[[Action in der Arena]]\nDie ARENA...\n\n[[Ein Campingplatz zu haben]]\nHier...`;
const a = untranslatedHeaders(src, de), b = untranslatedHeaders(src, ok);
const pass = a.length === 2 && a.includes('A Campsite Opportunity') && b.length === 0;
console.log(pass ? 'PASS' : 'FAIL', JSON.stringify(a), JSON.stringify(b));
process.exit(pass ? 0 : 1);
