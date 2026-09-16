/**
 * British-English register for the markets that are not American.
 *
 * Two separate problems, both visible to publishers:
 *
 * 1. SPELLING. The enrichment prompt is written in American English, so Gemini
 *    returns "theater", "center", "program" even for a Sussex market town. A UK
 *    editor reads that as a foreign wire feed, not local copy. Lewes carried
 *    "Theater Performance" on the same line as "Lewes Little Theatre".
 *
 * 2. REGISTER. "Neighborhood" is not a word British or Irish local press uses
 *    for a place. Christchurch is a town. County Clare is a county. Calling
 *    either a neighbourhood is the tell that nobody local wrote it.
 *
 * The prompt asks for both (see brief-enricher-gemini.ts). anglicise() is the
 * net underneath: Gemini follows its examples over its instructions, so spelling
 * is enforced after generation rather than hoped for.
 */

/** Countries whose readers expect British spelling. */
const BRITISH_ENGLISH_COUNTRIES = new Set(
  [
    'UK', 'United Kingdom', 'Great Britain', 'England', 'Scotland', 'Wales',
    'Northern Ireland', 'Ireland', 'Republic of Ireland',
    'Australia', 'New Zealand', 'South Africa',
    'Singapore', 'Hong Kong', 'India', 'Malaysia',
  ].map((c) => c.toLowerCase())
);

export function usesBritishEnglish(country: string | null | undefined): boolean {
  return BRITISH_ENGLISH_COUNTRIES.has((country || '').trim().toLowerCase());
}

/**
 * Canada takes half of the British list and rejects the other half. It writes
 * colour, centre, travelled and defence, and it writes organize, program,
 * sidewalk, soccer, aluminum and gotten. Treating it as British is as wrong as
 * treating it as American: a Chilliwack reader spots "organise" and "pavement"
 * exactly as fast as a Lewes reader spotted "theater".
 */
const CANADIAN_ENGLISH_COUNTRIES = new Set(['canada']);

export function usesCanadianEnglish(country: string | null | undefined): boolean {
  return CANADIAN_ENGLISH_COUNTRIES.has((country || '').trim().toLowerCase());
}

/** Which spelling set applies. Anything else keeps American spelling. */
export type SpellingVariant = 'british' | 'canadian' | 'american';

export function spellingVariantFor(country: string | null | undefined): SpellingVariant {
  if (usesCanadianEnglish(country)) return 'canadian';
  if (usesBritishEnglish(country)) return 'british';
  return 'american';
}

/**
 * The register rules below are drawn from British and Irish local newspapers.
 * They do not travel: "neighbourhood" is ordinary in Singapore and Hong Kong,
 * and Australia says "suburb". Spelling still applies everywhere.
 */
const UK_IE_COUNTRIES = new Set(
  ['UK', 'United Kingdom', 'Great Britain', 'England', 'Scotland', 'Wales',
   'Northern Ireland', 'Ireland', 'Republic of Ireland'].map((c) => c.toLowerCase())
);

function isUkOrIreland(country: string | null | undefined): boolean {
  return UK_IE_COUNTRIES.has((country || '').trim().toLowerCase());
}

/**
 * UK and Irish counties / administrative areas that appear in our `city` column.
 * When the "city" is one of these, the place itself is a town, not a district of
 * a city. Greater London and the named cities are deliberately absent: Mayfair
 * really is a neighbourhood.
 */
const COUNTY_LEVEL_AREAS = new Set(
  [
    // England
    'Bedfordshire', 'Berkshire', 'Buckinghamshire', 'Cambridgeshire', 'Cheshire',
    'Cornwall', 'Cumbria', 'Derbyshire', 'Devon', 'Dorset', 'Durham',
    'East Riding of Yorkshire', 'East Sussex', 'Essex', 'Gloucestershire',
    'Greater Manchester', 'Hampshire', 'Herefordshire', 'Hertfordshire',
    'Isle of Wight', 'Kent', 'Lancashire', 'Leicestershire', 'Lincolnshire',
    'Merseyside', 'Norfolk', 'North Yorkshire', 'Northamptonshire',
    'Northumberland', 'Nottinghamshire', 'Oxfordshire', 'Rutland', 'Shropshire',
    'Somerset', 'South Yorkshire', 'Staffordshire', 'Suffolk', 'Surrey',
    'Sussex', 'Tyne and Wear', 'Warwickshire', 'West Midlands', 'West Sussex',
    'West Yorkshire', 'Wiltshire', 'Worcestershire',
    // Scotland
    'Aberdeenshire', 'Angus', 'Argyll and Bute', 'Ayrshire', 'Clackmannanshire',
    'Dumfries and Galloway', 'Dunbartonshire', 'East Lothian', 'Fife',
    'Highland', 'Inverclyde', 'Midlothian', 'Moray', 'Perth and Kinross',
    'Renfrewshire', 'Scottish Borders', 'Stirling', 'West Lothian',
    // Wales
    'Anglesey', 'Blaenau Gwent', 'Bridgend', 'Caerphilly', 'Carmarthenshire',
    'Ceredigion', 'Conwy', 'Denbighshire', 'Flintshire', 'Gwynedd',
    'Merthyr Tydfil', 'Monmouthshire', 'Neath Port Talbot', 'Pembrokeshire',
    'Powys', 'Rhondda Cynon Taf', 'Torfaen', 'Vale of Glamorgan', 'Wrexham',
    // Northern Ireland
    'Antrim', 'Armagh', 'Down', 'Fermanagh', 'Londonderry', 'Tyrone',
  ].map((c) => c.toLowerCase())
);

/**
 * Editions that cover a whole city rather than one part of it. Without this,
 * a city-wide Birmingham edition inherits "town" from its county-level `city`
 * column, and calling Birmingham a town in front of a Birmingham publisher is
 * exactly the tell we are trying to remove.
 */
export const CITY_LEVEL_EDITION_IDS: ReadonlySet<string> = new Set([
  'westmidlands-birmingham',
  // Overstory Media Group, Fraser Valley (named by Shannon Havard, 2026-09-16).
  // All three are cities in their own right, so without this they inherit
  // "neighbourhood" from the fallback and a 160,000-person city calls itself one.
  'fraservalley-chilliwack',
  'fraservalley-langley',
  'fraservalley-abbotsford',
]);

/**
 * Editions covering a whole London borough. British local press calls these
 * "the borough" and never "the city" or "the area", and the borough is the unit
 * a London reader recognises. Without this, Haringey inherits "area" from the
 * UK-and-Ireland district rule and reads like one of its own neighbourhoods.
 */
export const BOROUGH_LEVEL_EDITION_IDS: ReadonlySet<string> = new Set([
  'london-haringey',
]);

export interface PlaceDescriptor {
  id?: string | null;
  name: string;
  city?: string | null;
  country?: string | null;
}

/**
 * The noun the copy should use for this place: "county", "town", or the local
 * spelling of neighbourhood. This is what the reader sees in a sentence like
 * "the {noun}'s rich history".
 */
export function getPlaceNoun(place: PlaceDescriptor): string {
  const id = (place.id || '').toLowerCase();
  const name = (place.name || '').trim();
  const city = (place.city || '').trim().toLowerCase();
  const british = usesBritishEnglish(place.country);

  if (id.startsWith('ie-county-') || /^county\s/i.test(name)) return 'county';
  if (id === 'ie-ireland' || name.toLowerCase() === 'ireland') return 'country';
  if (CITY_LEVEL_EDITION_IDS.has(id)) return 'city';
  if (BOROUGH_LEVEL_EDITION_IDS.has(id)) return 'borough';
  if (british && COUNTY_LEVEL_AREAS.has(city)) return 'town';
  // "Area" is what British and Irish local press actually calls a district of a
  // city. "Neighbourhood" is correct English and still reads as an import there,
  // but it is ordinary usage in Singapore and Hong Kong, so this stays local.
  if (isUkOrIreland(place.country)) return 'area';
  // Canada spells it the British way even though the rest of its register is
  // closer to American.
  if (british || usesCanadianEnglish(place.country)) return 'neighbourhood';
  return 'neighborhood';
}

/**
 * Proper nouns that keep American spelling wherever they appear, plus the UK
 * brands that are genuinely spelled the American way.
 */
const PROTECTED = [
  'Center Parcs',
  'Lincoln Center', 'Kennedy Center', 'Rockefeller Center', 'World Trade Center',
  'Barclays Center', 'Javits Center', 'Moscone Center',
  'Labor Day', 'Pearl Harbor', 'Department of Labor',
  'World Health Organization', 'International Labour Organization',
  'Centers for Disease Control', 'Center for Disease Control',
  'Color Factory', 'Technicolor',
];

/**
 * Spellings Canada shares with Britain: -our, -re, doubled -ll-, -ce, grey,
 * litre. Whole words only, applied in lower and capitalised form.
 */
const SHARED_SPELLINGS: Array<[string, string]> = [
  ['neighborhood', 'neighbourhood'],
  ['neighborhoods', 'neighbourhoods'],
  ['neighbor', 'neighbour'],
  ['neighbors', 'neighbours'],
  ['neighboring', 'neighbouring'],
  ['center', 'centre'],
  ['centers', 'centres'],
  ['centered', 'centred'],
  ['theater', 'theatre'],
  ['theaters', 'theatres'],
  ['color', 'colour'],
  ['colors', 'colours'],
  ['colored', 'coloured'],
  ['colorful', 'colourful'],
  ['favorite', 'favourite'],
  ['favorites', 'favourites'],
  ['favor', 'favour'],
  ['flavor', 'flavour'],
  ['flavors', 'flavours'],
  ['harbor', 'harbour'],
  ['honor', 'honour'],
  ['honored', 'honoured'],
  ['humor', 'humour'],
  ['labor', 'labour'],
  ['rumor', 'rumour'],
  ['rumors', 'rumours'],
  ['savor', 'savour'],
  ['behavior', 'behaviour'],
  ['endeavor', 'endeavour'],
  ['traveled', 'travelled'],
  ['traveling', 'travelling'],
  ['traveler', 'traveller'],
  ['travelers', 'travellers'],
  ['canceled', 'cancelled'],
  ['canceling', 'cancelling'],
  ['modeled', 'modelled'],
  ['modeling', 'modelling'],
  ['fueled', 'fuelled'],
  ['defense', 'defence'],
  ['offense', 'offence'],
  ['gray', 'grey'],
  ['liter', 'litre'],
  ['liters', 'litres'],
];

/**
 * British but NOT Canadian. Canada keeps American -ize, writes "program",
 * "aluminum" and "gotten", and says sidewalk and soccer. Applying these to a
 * Canadian edition is its own tell.
 *
 * "downtown" is deliberately absent from the vocabulary rules: it turns up
 * inside proper event names ("Downtown Dublin Farmers Market"), so the prompt
 * asks for it instead.
 */
const BRITISH_ONLY_SPELLINGS: Array<[string, string]> = [
  ['program', 'programme'],
  ['programs', 'programmes'],
  ['organize', 'organise'],
  ['organized', 'organised'],
  ['organizer', 'organiser'],
  ['organizers', 'organisers'],
  ['organizing', 'organising'],
  ['organization', 'organisation'],
  ['organizations', 'organisations'],
  ['recognize', 'recognise'],
  ['recognized', 'recognised'],
  ['realize', 'realise'],
  ['realized', 'realised'],
  ['apologize', 'apologise'],
  ['apologized', 'apologised'],
  ['specialize', 'specialise'],
  ['specialized', 'specialised'],
  ['specializing', 'specialising'],
  ['aluminum', 'aluminium'],
  ['gotten', 'got'],
  ['sidewalk', 'pavement'],
  ['sidewalks', 'pavements'],
  ['soccer', 'football'],
];

/**
 * Phrase-level tells that no word list catches. British and Irish English drops
 * the article: "taken to hospital", "in hospital", "at university". An Armagh
 * brief said a pedestrian was "taken to the hospital", which is the kind of
 * thing a news editor hears immediately even though every word is spelled right.
 */
const PHRASES: Array<[RegExp, string]> = [
  [/\b(taken|rushed|airlifted|admitted|brought)\s+to\s+the\s+hospital\b/gi, '$1 to hospital'],
  [/\bwent\s+to\s+the\s+hospital\b/gi, 'went to hospital'],
  [/\bis\s+in\s+the\s+hospital\b/gi, 'is in hospital'],
  [/\bremains\s+in\s+the\s+hospital\b/gi, 'remains in hospital'],
  [/\bat\s+the\s+university\s+studying\b/gi, 'at university studying'],
  [/\bon\s+the\s+weekend\b/gi, 'at the weekend'],
];

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const PLACEHOLDER_OPEN = 'PN';
const PLACEHOLDER_CLOSE = 'PN';

/**
 * Rewrite American spellings into British ones, leaving protected proper nouns
 * alone. Safe to run more than once.
 */
export function anglicise(
  text: string | null | undefined,
  variant: SpellingVariant = 'british',
): string {
  if (!text) return text || '';
  if (variant === 'american') return text;
  let out = text;

  const parked: string[] = [];
  const park = (value: string) => {
    parked.push(value);
    return `${PLACEHOLDER_OPEN}${parked.length - 1}${PLACEHOLDER_CLOSE}`;
  };

  // Park URLs first. "/theater/" inside a link would otherwise be rewritten and
  // the link would 404.
  out = out.replace(/https?:\/\/[^\s)\]]+/g, (m) => park(m));

  // Park the proper nouns behind placeholders so the word rules cannot touch them
  for (const phrase of PROTECTED) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    out = out.replace(re, (m) => park(m));
  }

  const rules = variant === 'canadian'
    ? SHARED_SPELLINGS
    : [...SHARED_SPELLINGS, ...BRITISH_ONLY_SPELLINGS];

  for (const [us, uk] of rules) {
    out = out.replace(new RegExp(`\\b${us}\\b`, 'g'), uk);
    out = out.replace(new RegExp(`\\b${capitalise(us)}\\b`, 'g'), capitalise(uk));
  }

  // PHRASES is British only. Canada says "taken to the hospital" and "on the
  // weekend", the same as the United States.
  for (const [re, replacement] of variant === 'canadian' ? [] : PHRASES) {
    out = out.replace(re, replacement);
  }

  return out.replace(
    new RegExp(`${PLACEHOLDER_OPEN}(\\d+)${PLACEHOLDER_CLOSE}`, 'g'),
    (_m, i) => parked[Number(i)]
  );
}

/**
 * Replace "neighbourhood" with the noun this place actually takes.
 *
 * The prompt asks for it and Gemini still writes "our neighbourhood" about a
 * Birmingham suburb. Spelling is enforced after generation for the same reason;
 * register needs the same treatment. Only runs when the place is not itself a
 * neighbourhood, so Mayfair keeps the word.
 */
export function enforcePlaceNoun(text: string | null | undefined, noun: string): string {
  if (!text || noun === 'neighbourhood' || noun === 'neighborhood') return text || '';
  const plural = noun === 'city' ? 'cities' : `${noun}s`;
  return text
    .replace(/\bneighbourhoods\b/g, plural)
    .replace(/\bneighborhoods\b/g, plural)
    .replace(/\bNeighbourhoods\b/g, capitalise(plural))
    .replace(/\bNeighborhoods\b/g, capitalise(plural))
    .replace(/\bneighbourhood\b/g, noun)
    .replace(/\bneighborhood\b/g, noun)
    .replace(/\bNeighbourhood\b/g, capitalise(noun))
    .replace(/\bNeighborhood\b/g, capitalise(noun));
}

/**
 * The prompt block. Tells Gemini the register and the spelling before it writes,
 * so anglicise() has little left to catch.
 */
export function britishStyleBlock(place: PlaceDescriptor): string {
  if (!usesBritishEnglish(place.country)) return '';
  const noun = getPlaceNoun(place);
  const nounLine =
    noun === 'county'
      ? `${place.name} is a COUNTY. Call it "the county" or by name. Never "the neighbourhood", never "the area's community".`
      : noun === 'country'
        ? `Ireland is a COUNTRY. Call it "the country" or by name.`
        : noun === 'city'
          ? `${place.name} is a CITY. Call it "the city" or by name, and name the district or suburb a story happens in. NEVER "the neighborhood" or "the neighbourhood".`
          : noun === 'town'
            ? `${place.name} is a TOWN. Call it "the town" or by name. NEVER "the neighborhood" or "the neighbourhood" - British and Irish local press does not use that word for a place.`
            : `${place.name} is a district of ${place.city}. Call it by name, or "the area". NEVER "the neighborhood" or "the neighbourhood": British and Irish local press does not use that word, and it is the clearest sign the writer is not local. Name the streets, the high street and the ward.`;

  return `

BRITISH ENGLISH - NON-NEGOTIABLE. This edition is read in ${place.country}.
- ${nounLine}
- British spelling throughout: theatre, centre, programme, colour, favourite, honour, organised, recognised, travelled, cancelled, defence, grey, litre. NEVER the American forms.
- British vocabulary: pavement not sidewalk, town centre not downtown, car park not parking lot, football not soccer, autumn not fall, shop not store, flat where the source says apartment, postcode not zip code, council not city hall, A&E not ER.
- Money in pounds for the UK, euro for Ireland. Dates as "Monday 15 September", never "September 15".
- A licence is the noun, to license is the verb.
- Keep proper nouns exactly as their owner spells them (Lewes Little Theatre, Center Parcs, The Thomas Tripp).`;
}
