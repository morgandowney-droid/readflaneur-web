/**
 * What place names the search is actually given.
 *
 * There are TWO catchment knobs and they control different halves of the
 * product. Reaching for the wrong one does nothing and looks like it should.
 *
 * `neighborhoods.radius` (metres) drives the STRUCTURED event-source lookups:
 * `event-sources.ts` converts it to km for the Eventbrite `location.within`
 * query and `google-places.ts` uses it for nearby search. Those feed
 * `sync-tonight`, `sync-guides` and the guides API. The catchment rule for it
 * is a soft floor of 10,000 people and a target of 25,000 or more.
 *
 * It does NOT reach `generate-look-ahead` or `sync-neighborhood-briefs`, which
 * are the Grok and Gemini search paths that actually write the Daily Brief and
 * the Look Ahead. Those receive place NAMES and nothing else, so the only way
 * to widen or narrow them is the string handed to the search. That is why combo
 * neighbourhoods work by joining their component names, and it is what this
 * file generalises.
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
