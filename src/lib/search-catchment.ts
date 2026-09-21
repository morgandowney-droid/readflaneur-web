/**
 * What place names the search is actually given.
 *
 * `neighborhoods.radius` looks like the knob for this and is not: it is stored
 * on every row and never reaches Grok or Gemini. The only thing that widens or
 * narrows a catchment is the string of place names handed to the search, which
 * is why combo neighbourhoods work by joining their component names.
 *
 * This is the same mechanism for editions that are not combos but still cover
 * more ground than their name implies. An Australian Local Government Area is
 * the case that forced it: Andy Drummond at AAP named the Charters Towers
 * Region, which is 68,366 km2 and contains six outlying townships that a search
 * for "Charters Towers" alone will never look at.
 *
 * Keep the entries honest. Every name here must genuinely belong to the edition
 * the reader thinks they are reading, or the edition stops being local. The
 * boundary to respect for Charters Towers is Townsville, 130km east and
 * population 200,000: pulling that in would drown the edition and it is a
 * different council entirely.
 */

/** Edition id -> the place names the search should cover, in priority order. */
const SEARCH_CATCHMENTS: Readonly<Record<string, readonly string[]>> = {
  // Charters Towers Region, Queensland. Townships per the regional council's
  // own listing. They are very small (Mingela 14 people, Ravenswood 297), so
  // this widens council and district coverage rather than adding much event
  // volume. Deliberately excludes Townsville.
  'queensland-charters-towers': [
    'Charters Towers',
    'Ravenswood',
    'Pentland',
    'Greenvale',
    'Homestead',
    'Mingela',
    'Hervey Range',
  ],
  // City of Greater Shepparton, Victoria. Shepparton and Mooroopna are one
  // urban area split by the Goulburn River; Tatura, Murchison and Merrigum are
  // the other towns inside the municipality.
  'victoria-greater-shepparton': [
    'Shepparton',
    'Mooroopna',
    'Tatura',
    'Murchison',
    'Merrigum',
  ],
};

/**
 * The name to search for this edition. Falls back to the edition's own name,
 * so anything not listed above behaves exactly as before.
 */
export function searchCatchmentFor(
  neighborhoodId: string | null | undefined,
  fallbackName: string,
): string {
  const places = SEARCH_CATCHMENTS[(neighborhoodId || '').toLowerCase()];
  return places && places.length > 0 ? places.join(', ') : fallbackName;
}

export function hasSearchCatchment(neighborhoodId: string | null | undefined): boolean {
  return Boolean(SEARCH_CATCHMENTS[(neighborhoodId || '').toLowerCase()]);
}
