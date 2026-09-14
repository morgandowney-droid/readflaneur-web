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
  'New Zealand|Aotearoa|Australia|Canada|United States|U\\.?S\\.?A\\.?|South Africa|Singapore|India|Pakistan|Germany|Deutschland|France|Spain|España|Italy|Italia|Netherlands|Belgium|Portugal|Sweden|Norway|Denmark|Finland|Poland|Austria|Switzerland|Greece|Turkey|Japan|China|Hong Kong|Brazil|Argentina|Mexico|Kenya|Nigeria|UAE|Dubai|Ireland|United Kingdom|England|Scotland|Wales';

/** US state codes in the ", AL 35205" / ", AL." shape that ends an address. */
const US_STATE_IN_ADDRESS =
  /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IA|KS|KY|LA|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b(?:\s*\d{5})?(?=[.,;]|\s|$)/;

/** Countries that mean the same market, so one does not look foreign to the other. */
const SAME_MARKET: Record<string, string[]> = {
  'uk': ['united kingdom', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'],
  'united kingdom': ['uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'],
  'ireland': ['republic of ireland', 'northern ireland', 'united kingdom', 'uk'],
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
