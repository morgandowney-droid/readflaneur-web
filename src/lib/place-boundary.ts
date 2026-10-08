/**
 * Keep an edition inside its own country.
 *
 * Town names are not unique. Naming the place in a search prompt is not enough,
 * because the American namesake is often better indexed than the original:
 *
 *   County Roscommon ran a Board of Commissioners meeting in Roscommon, Michigan
 *   County Wexford ran children's T-ball in Wexford, Pennsylvania
 *   County Louth ran a sweetFrog in Dundalk, Maryland
 *   Lymington ran a zoning hearing in Farmington Hills, Michigan
 *   Lewes ran a planning commission in Lewes, Delaware
 *
 * Each of those prompts already said "United Kingdom" or "Ireland". What they
 * did not say was that a venue outside the country is a reason to DROP the
 * event. Stating the country describes; this rejects.
 */

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  'uk': 'pounds sterling (£)',
  'united kingdom': 'pounds sterling (£)',
  'great britain': 'pounds sterling (£)',
  'england': 'pounds sterling (£)',
  'scotland': 'pounds sterling (£)',
  'wales': 'pounds sterling (£)',
  'northern ireland': 'pounds sterling (£)',
  'ireland': 'euro (€)',
  'republic of ireland': 'euro (€)',
  'france': 'euro (€)',
  'germany': 'euro (€)',
  'spain': 'euro (€)',
  'italy': 'euro (€)',
  'netherlands': 'euro (€)',
  'portugal': 'euro (€)',
  'usa': 'US dollars ($)',
  'united states': 'US dollars ($)',
  'sweden': 'Swedish kronor (kr)',
  'norway': 'Norwegian kroner (kr)',
  'switzerland': 'Swiss francs (CHF)',
  'australia': 'Australian dollars (A$)',
  'new zealand': 'New Zealand dollars (NZ$)',
  'singapore': 'Singapore dollars (S$)',
  'hong kong': 'Hong Kong dollars (HK$)',
  'japan': 'yen (¥)',
  'south africa': 'rand (R)',
  'canada': 'Canadian dollars (C$)',
};

export function getCurrencyName(country: string | null | undefined): string | null {
  return CURRENCY_BY_COUNTRY[(country || '').trim().toLowerCase()] || null;
}

/**
 * Countries as they appear in a venue address. Asking the model to reject these
 * is not enough on its own: a Birmingham edition was published with ten events
 * at Tin Roof, The Nick and Cahaba Brewing, all in Birmingham, Alabama, from a
 * prompt that already said "if it is not in the United Kingdom, DROP IT". The
 * prompt reduces the problem; this removes it.
 */
const COUNTRY_IN_ADDRESS =
  'New Zealand|Aotearoa|Australia|Canada|United States|U\\.?S\\.?A\\.?|South Africa|Singapore|India|Pakistan|Germany|Deutschland|France|Spain|España|Italy|Italia|Netherlands|Belgium|Portugal|Sweden|Norway|Denmark|Finland|Poland|Austria|Österreich|Switzerland|Schweiz|Suisse|Svizzera|Sverige|Norge|Danmark|Greece|Turkey|Japan|China|Hong Kong|Brazil|Argentina|Mexico|Kenya|Nigeria|UAE|Dubai|Ireland|United Kingdom|England|Scotland|Wales';

/** US state codes in the ", AL 35205" / ", AL." shape that ends an address. */
const US_STATE_IN_ADDRESS =
  /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IA|KS|KY|LA|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b(?:\s*\d{5})?(?=[.,;]|\s|$)/;

/** Countries that mean the same market, so one does not look foreign to the other. */
const SAME_MARKET: Record<string, string[]> = {
  'uk': ['united kingdom', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'],
  'united kingdom': ['uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'],
  'ireland': ['republic of ireland', 'northern ireland', 'united kingdom', 'uk'],
  // A country's own name for itself is home, not abroad. Without these a venue
  // whose address ended "Italia" counted as abroad in an Italian edition.
  'italy': ['italia'],
  'germany': ['deutschland'],
  'spain': ['españa'],
  'austria': ['österreich'],
  'switzerland': ['schweiz', 'suisse', 'svizzera'],
  'sweden': ['sverige'],
  'norway': ['norge'],
  'denmark': ['danmark'],
};

/**
 * True when a venue's address names a country that is not this edition's.
 *
 * Tested against the venue and address only, never a whole story: a Belfast
 * wine tasting may pour New Zealand wine, and "All My Friends Are In Australia"
 * is a play in Portlaoise. Where the venue IS decides it.
 */
export function isVenueAbroad(venue: string | null | undefined, country: string | null | undefined): boolean {
  if (!venue || !country) return false;
  const home = country.trim().toLowerCase();
  const ours = new Set([home, ...(SAME_MARKET[home] || [])]);

  if (!ours.has('usa') && !ours.has('united states') && US_STATE_IN_ADDRESS.test(venue)) return true;

  const re = new RegExp(`(?:^|,|\\(|\\s)\\s*(${COUNTRY_IN_ADDRESS})\\b`, 'gi');
  for (const match of venue.matchAll(re)) {
    const named = match[1].toLowerCase().replace(/\./g, '');
    const normalised = /^u\.?s\.?a?$/.test(named) ? 'united states' : named;
    if (!ours.has(normalised)) return true;
  }
  return false;
}

/**
 * A rejection rule for any prompt that searches the open web for a named place.
 * Written as a test the model applies per item, not as background context.
 */
export function geographicBoundaryBlock(
  neighborhoodName: string,
  city: string,
  country?: string | null
): string {
  if (!country) return '';
  const currency = getCurrencyName(country);
  const isUS = /^(usa|united states)$/i.test(country.trim());

  return `

GEOGRAPHIC BOUNDARY - THIS IS A REJECTION TEST, NOT A PREFERENCE.
- Every item MUST be in ${neighborhoodName}, ${city}, ${country}, or close enough that a resident would travel to it.
- Place names repeat across countries. There are almost certainly towns called ${neighborhoodName} elsewhere, and they are NOT this place. The better-indexed result is often the wrong country.
- Before you include anything, resolve the venue address. If it is not in ${country}, DROP IT. If you cannot tell which country the venue is in, DROP IT. A thin edition is correct; a foreign one is not.${
    currency ? `\n- Prices in ${country} are quoted in ${currency}. An item priced in another currency is from the wrong country. DROP IT.` : ''
  }${
    isUS ? '' : `\n- US civic bodies (Township, Planning Commission, Board of Commissioners, Board of Selectmen, School District) do not exist in ${country}. Any item naming one is from the United States. DROP IT.`
  }${
    isUS ? '' : `\n- A US state name or two-letter state code in an address (", Michigan", ", NH 03581") means the wrong country. DROP IT.`
  }`;
}

/**
 * Keep an edition inside its own city.
 *
 * isVenueAbroad() catches a namesake in another country. A namesake can also
 * sit in another city of the same country: Zaragoza's Delicias edition of
 * 8 Oct 2026 ran an exhibition "at Espacio Delicias in Madrid", because Madrid
 * has its own barrio called Delicias. The prompt already said every item must
 * be in Delicias, Zaragoza; the model framed it as worth the trip.
 *
 * The test is narrow on purpose: a venue placed in a named city ("at X in
 * Madrid") more than OUT_OF_AREA_KM from the edition's own city. Only cities in
 * this table count, and an edition whose city is not in it is never touched,
 * so a Kildare edition can still send readers to Dublin.
 */
const OUT_OF_AREA_KM = 60;
const MAJOR_CITIES: Array<{ names: string[]; lat: number; lng: number }> = [
  // Spain
  { names: ['Madrid'], lat: 40.4168, lng: -3.7038 },
  { names: ['Barcelona'], lat: 41.3874, lng: 2.1686 },
  { names: ['Valencia', 'València'], lat: 39.4699, lng: -0.3763 },
  { names: ['Seville', 'Sevilla'], lat: 37.3891, lng: -5.9845 },
  { names: ['Zaragoza'], lat: 41.6488, lng: -0.8891 },
  { names: ['Málaga', 'Malaga'], lat: 36.7213, lng: -4.4214 },
  { names: ['Bilbao'], lat: 43.263, lng: -2.935 },
  { names: ['Murcia'], lat: 37.9922, lng: -1.1307 },
  { names: ['Palma'], lat: 39.5696, lng: 2.6502 },
  { names: ['Alicante'], lat: 38.3452, lng: -0.481 },
  { names: ['Córdoba', 'Cordoba'], lat: 37.8882, lng: -4.7794 },
  { names: ['Valladolid'], lat: 41.6523, lng: -4.7245 },
  { names: ['Granada'], lat: 37.1773, lng: -3.5986 },
  { names: ['Pamplona'], lat: 42.8125, lng: -1.6458 },
  { names: ['San Sebastián', 'San Sebastian', 'Donostia'], lat: 43.3183, lng: -1.9812 },
  // Germany
  { names: ['Berlin'], lat: 52.52, lng: 13.405 },
  { names: ['Hamburg'], lat: 53.5511, lng: 9.9937 },
  { names: ['Munich', 'München'], lat: 48.1351, lng: 11.582 },
  { names: ['Cologne', 'Köln'], lat: 50.9375, lng: 6.9603 },
  { names: ['Frankfurt'], lat: 50.1109, lng: 8.6821 },
  { names: ['Stuttgart'], lat: 48.7758, lng: 9.1829 },
  { names: ['Düsseldorf', 'Dusseldorf'], lat: 51.2277, lng: 6.7735 },
  { names: ['Leipzig'], lat: 51.3397, lng: 12.3731 },
  { names: ['Dresden'], lat: 51.0504, lng: 13.7373 },
  { names: ['Hanover', 'Hannover'], lat: 52.3759, lng: 9.732 },
  { names: ['Nuremberg', 'Nürnberg'], lat: 49.4521, lng: 11.0767 },
  { names: ['Bremen'], lat: 53.0793, lng: 8.8017 },
  // Italy
  { names: ['Rome', 'Roma'], lat: 41.9028, lng: 12.4964 },
  { names: ['Milan', 'Milano'], lat: 45.4642, lng: 9.19 },
  { names: ['Naples', 'Napoli'], lat: 40.8518, lng: 14.2681 },
  { names: ['Turin', 'Torino'], lat: 45.0703, lng: 7.6869 },
  { names: ['Palermo'], lat: 38.1157, lng: 13.3615 },
  { names: ['Genoa', 'Genova'], lat: 44.4056, lng: 8.9463 },
  { names: ['Bologna'], lat: 44.4949, lng: 11.3426 },
  { names: ['Florence', 'Firenze'], lat: 43.7696, lng: 11.2558 },
  { names: ['Venice', 'Venezia'], lat: 45.4408, lng: 12.3155 },
  // France
  { names: ['Paris'], lat: 48.8566, lng: 2.3522 },
  { names: ['Marseille'], lat: 43.2965, lng: 5.3698 },
  { names: ['Lyon'], lat: 45.764, lng: 4.8357 },
  { names: ['Toulouse'], lat: 43.6047, lng: 1.4442 },
  { names: ['Nice'], lat: 43.7102, lng: 7.262 },
  { names: ['Bordeaux'], lat: 44.8378, lng: -0.5792 },
  { names: ['Lille'], lat: 50.6292, lng: 3.0573 },
  { names: ['Strasbourg'], lat: 48.5734, lng: 7.7521 },
  // UK and Ireland
  { names: ['London'], lat: 51.5072, lng: -0.1276 },
  { names: ['Birmingham'], lat: 52.4862, lng: -1.8904 },
  { names: ['Manchester'], lat: 53.4808, lng: -2.2426 },
  { names: ['Glasgow'], lat: 55.8642, lng: -4.2518 },
  { names: ['Edinburgh'], lat: 55.9533, lng: -3.1883 },
  { names: ['Liverpool'], lat: 53.4084, lng: -2.9916 },
  { names: ['Leeds'], lat: 53.8008, lng: -1.5491 },
  { names: ['Bristol'], lat: 51.4545, lng: -2.5879 },
  { names: ['Cardiff'], lat: 51.4816, lng: -3.1791 },
  { names: ['Belfast'], lat: 54.5973, lng: -5.9301 },
  { names: ['Dublin'], lat: 53.3498, lng: -6.2603 },
  { names: ['Cork'], lat: 51.8985, lng: -8.4756 },
  { names: ['Limerick'], lat: 52.6638, lng: -8.6267 },
  { names: ['Galway'], lat: 53.2707, lng: -9.0568 },
  // Australia and New Zealand
  { names: ['Sydney'], lat: -33.8688, lng: 151.2093 },
  { names: ['Melbourne'], lat: -37.8136, lng: 144.9631 },
  { names: ['Brisbane'], lat: -27.4698, lng: 153.0251 },
  { names: ['Perth'], lat: -31.9523, lng: 115.8613 },
  { names: ['Adelaide'], lat: -34.9285, lng: 138.6007 },
  { names: ['Auckland'], lat: -36.8485, lng: 174.7633 },
  { names: ['Wellington'], lat: -41.2865, lng: 174.7762 },
  { names: ['Christchurch'], lat: -43.5321, lng: 172.6362 },
  { names: ['Queenstown'], lat: -45.0312, lng: 168.6626 },
];

function findCity(name: string | null | undefined) {
  const n = (name || '').trim().toLowerCase();
  if (!n) return null;
  return MAJOR_CITIES.find((c) => c.names.some((x) => x.toLowerCase() === n)) || null;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Cities far from the edition's own city, as one alternation; null when the edition's city is not in the table. */
function farCitiesPattern(editionCity: string | null | undefined): string | null {
  const home = findCity(editionCity);
  if (!home) return null;
  const names = MAJOR_CITIES
    .filter((c) => distanceKm(home, c) > OUT_OF_AREA_KM)
    .flatMap((c) => c.names)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return names.length ? names.join('|') : null;
}

/** The far city a passage places a venue in ("at Espacio Delicias in Madrid"), or null. */
export function venueInFarCity(text: string, editionCity: string | null | undefined): string | null {
  const far = farCitiesPattern(editionCity);
  if (!far || !text) return null;
  const m = text.match(new RegExp(`\\bat\\s+[^.;:!?\\n]{1,80}?\\s+in\\s+(${far})\\b`, 'i'));
  return m ? m[1] : null;
}

/**
 * Drop each [[section]] whose story is set at a venue in a far city. Text before
 * the first header (the greeting) is never touched. Returns the cities removed.
 */
export function dropFarCitySections(
  text: string,
  editionCity: string | null | undefined,
): { text: string; dropped: string[] } {
  if (!text || !text.includes('[[') || !farCitiesPattern(editionCity)) return { text, dropped: [] };
  const parts = text.split(/(?=^[ \t]*\[\[[^\]\n]+\]\][ \t]*$)/m);
  const dropped: string[] = [];
  const kept: string[] = [];
  parts.forEach((part, i) => {
    if (i === 0 && !/^\s*\[\[/.test(part)) { kept.push(part); return; }
    const city = venueInFarCity(part, editionCity);
    if (!city) { kept.push(part); return; }
    dropped.push(city);
    // The last section also carries the sign-off ("Hasta luego."): keep it.
    if (i === parts.length - 1) {
      const signOff = keepSignOff(part);
      if (signOff) kept.push(`\n${signOff}\n`);
    }
  });
  return { text: dropped.length ? kept.join('').replace(/\n{3,}/g, '\n\n') : text, dropped };
}

/** A short closing paragraph at the end of a section, or null. */
export function keepSignOff(section: string): string | null {
  const paras = section.trim().split(/\n{2,}/);
  if (paras.length < 2) return null; // the header and its story only
  const last = paras[paras.length - 1].trim();
  return last.length <= 80 && !/\[\[/.test(last) && !/\bat\s.+\sin\s/i.test(last) ? last : null;
}
