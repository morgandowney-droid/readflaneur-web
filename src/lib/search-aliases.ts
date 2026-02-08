/**
 * Shared search logic for neighborhood lookup — supports name, city,
 * combo component, country, region, and state/province matching.
 *
 * Used by both AdBookingCalendar and NeighborhoodSelectorModal.
 */

// ─── COUNTRY ALIASES ─────────────────────────────────────────────

const COUNTRY_ALIASES: Record<string, string[]> = {
  USA: ['US', 'United States', 'America', 'USA'],
  UK: ['United Kingdom', 'Britain', 'England', 'UK'],
  UAE: ['United Arab Emirates', 'Emirates', 'UAE'],
  Canada: ['Canada'],
  France: ['France'],
  Germany: ['Germany'],
  Italy: ['Italy'],
  Spain: ['Spain'],
  Portugal: ['Portugal'],
  Switzerland: ['Switzerland', 'Swiss'],
  Netherlands: ['Netherlands', 'Holland', 'Dutch'],
  Belgium: ['Belgium'],
  Sweden: ['Sweden'],
  Norway: ['Norway'],
  Denmark: ['Denmark'],
  Ireland: ['Ireland'],
  Greece: ['Greece'],
  Monaco: ['Monaco'],
  Japan: ['Japan'],
  'Hong Kong': ['Hong Kong', 'HK'],
  Singapore: ['Singapore'],
  'South Korea': ['South Korea', 'Korea'],
  China: ['China'],
  Thailand: ['Thailand'],
  Indonesia: ['Indonesia'],
  Australia: ['Australia'],
  'New Zealand': ['New Zealand', 'NZ'],
  Israel: ['Israel'],
  'Saudi Arabia': ['Saudi Arabia', 'Saudi', 'KSA'],
  'South Africa': ['South Africa'],
  Egypt: ['Egypt'],
  Mexico: ['Mexico'],
  Brazil: ['Brazil'],
  Argentina: ['Argentina'],
  Chile: ['Chile'],
  Colombia: ['Colombia'],
};

// ─── REGION ALIASES ──────────────────────────────────────────────

const REGION_ALIASES: Record<string, string[]> = {
  'north-america': ['North America', 'NA'],
  europe: ['Europe', 'EU', 'EMEA'],
  'asia-pacific': ['Asia', 'APAC', 'Asia Pacific', 'Asia-Pacific'],
  'middle-east': ['Middle East', 'Gulf', 'MENA', 'Africa'],
  'south-america': ['South America', 'Latin America', 'LATAM'],
};

// ─── STATE / PROVINCE ALIASES ────────────────────────────────────
// Maps display names to cities used in the DB (no state column — use city match)

interface StateMapping {
  aliases: string[];
  cities?: string[];
  neighborhoodIds?: string[];
}

const STATE_ALIASES: Record<string, StateMapping> = {
  // US states
  'New York State': {
    aliases: ['New York State', 'NY State', 'NYS'],
    cities: ['New York', 'The Hamptons'],
  },
  Connecticut: {
    aliases: ['Connecticut', 'CT'],
    cities: ['Connecticut'],
  },
  Massachusetts: {
    aliases: ['Massachusetts', 'MA'],
    cities: ['Boston'],
  },
  Florida: {
    aliases: ['Florida', 'FL'],
    cities: ['Florida', 'Miami'],
  },
  Georgia: {
    aliases: ['Georgia', 'GA'],
    cities: ['Atlanta'],
  },
  Pennsylvania: {
    aliases: ['Pennsylvania', 'PA'],
    cities: ['Philadelphia'],
  },
  California: {
    aliases: ['California', 'CA'],
    cities: ['Los Angeles', 'San Francisco', 'California', 'Santa Barbara'],
  },
  Illinois: {
    aliases: ['Illinois', 'IL'],
    cities: ['Chicago'],
  },
  Texas: {
    aliases: ['Texas', 'TX'],
    cities: ['Dallas', 'Houston', 'Austin'],
  },
  Colorado: {
    aliases: ['Colorado', 'CO'],
    cities: ['Colorado', 'Denver'],
  },
  Wyoming: {
    aliases: ['Wyoming', 'WY'],
    cities: ['Wyoming'],
  },
  Washington: {
    aliases: ['Washington State', 'WA'],
    cities: ['Seattle'],
  },
  'Washington DC': {
    aliases: ['DC', 'District of Columbia'],
    cities: ['Washington DC'],
  },
  // International provinces
  'New South Wales': {
    aliases: ['New South Wales', 'NSW'],
    cities: ['Sydney'],
  },
  Victoria: {
    aliases: ['Victoria', 'VIC'],
    cities: ['Melbourne'],
  },
  'British Columbia': {
    aliases: ['British Columbia', 'BC'],
    cities: ['Vancouver'],
  },
  Quebec: {
    aliases: ['Quebec', 'QC'],
    cities: ['Montreal'],
  },
  Ontario: {
    aliases: ['Ontario', 'ON'],
    cities: ['Toronto'],
  },
  Hokkaido: {
    aliases: ['Hokkaido'],
    cities: ['Hokkaido'],
  },
};

// ─── SEARCH RESULT TYPE ──────────────────────────────────────────

export type MatchType = 'name' | 'city' | 'component' | 'state' | 'country' | 'region';

export interface SearchResult<T> {
  item: T;
  matchType: MatchType;
  score: number; // Lower = better match
  matchDetail?: string; // e.g., "Includes SoHo" or "California"
}

// ─── LOOKUP HELPERS ──────────────────────────────────────────────

/** Find the DB country value matching a search query */
export function findCountryForQuery(query: string): string | null {
  const lower = query.toLowerCase();
  for (const [country, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (country.toLowerCase() === lower) return country;
    if (aliases.some((a) => a.toLowerCase() === lower)) return country;
  }
  // Partial match
  for (const [country, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (country.toLowerCase().startsWith(lower) && lower.length >= 3) return country;
    if (aliases.some((a) => a.toLowerCase().startsWith(lower) && lower.length >= 3)) return country;
  }
  return null;
}

/** Find the DB region value matching a search query */
export function findRegionForQuery(query: string): string | null {
  const lower = query.toLowerCase();
  for (const [region, aliases] of Object.entries(REGION_ALIASES)) {
    if (region === lower) return region;
    if (aliases.some((a) => a.toLowerCase() === lower)) return region;
  }
  // Partial match
  for (const [region, aliases] of Object.entries(REGION_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase().startsWith(lower) && lower.length >= 3)) return region;
  }
  return null;
}

/** Find state/province entry matching a search query. Returns matched cities/neighborhood IDs. */
export function findStateForQuery(query: string): { label: string; cities?: string[]; neighborhoodIds?: string[] } | null {
  const lower = query.toLowerCase();
  for (const [label, mapping] of Object.entries(STATE_ALIASES)) {
    if (label.toLowerCase() === lower) return { label, ...mapping };
    if (mapping.aliases.some((a) => a.toLowerCase() === lower)) return { label, ...mapping };
  }
  // Partial match (need at least 3 chars)
  if (lower.length >= 3) {
    for (const [label, mapping] of Object.entries(STATE_ALIASES)) {
      if (label.toLowerCase().startsWith(lower)) return { label, ...mapping };
      if (mapping.aliases.some((a) => a.toLowerCase().startsWith(lower))) return { label, ...mapping };
    }
  }
  return null;
}

// ─── MAIN SEARCH FUNCTION ────────────────────────────────────────

interface Searchable {
  id: string;
  name: string;
  city: string;
  country?: string;
  region?: string;
  is_combo?: boolean;
  combo_component_names?: string[];
}

/**
 * Resolve a search query against a list of neighborhoods.
 * Returns matched items with match type and score for sorting.
 *
 * Priority (lower score = better):
 *   1. Name exact match (score 1)
 *   2. Name starts-with (score 2)
 *   3. Name contains (score 3)
 *   4. City exact match (score 4)
 *   5. City starts-with (score 5)
 *   6. Component name match (score 6)
 *   7. State/province match (score 7)
 *   8. Country match (score 8)
 *   9. Region match (score 9)
 */
export function resolveSearchQuery<T extends Searchable>(
  query: string,
  neighborhoods: T[]
): SearchResult<T>[] {
  if (query.length < 2) return [];

  const lower = query.toLowerCase();
  const results: SearchResult<T>[] = [];
  const seenIds = new Set<string>();

  const addResult = (item: T, matchType: MatchType, score: number, matchDetail?: string) => {
    if (seenIds.has(item.id)) return;
    seenIds.add(item.id);
    results.push({ item, matchType, score, matchDetail });
  };

  // Pre-check: does the query match a country/region/state alias?
  // If so, suppress loose substring matches (name-contains, city-contains)
  // to avoid "US" matching "Justicia" or "Bogenhausen"
  const hasAliasMatch = !!(findCountryForQuery(query) || findRegionForQuery(query) || findStateForQuery(query));

  // 1-3. Name matches
  for (const n of neighborhoods) {
    const nameLower = n.name.toLowerCase();
    if (nameLower === lower) {
      addResult(n, 'name', 1);
    } else if (nameLower.startsWith(lower)) {
      addResult(n, 'name', 2);
    } else if (!hasAliasMatch && nameLower.includes(lower)) {
      addResult(n, 'name', 3);
    }
  }

  // 4-5. City matches
  for (const n of neighborhoods) {
    const cityLower = n.city.toLowerCase();
    if (cityLower === lower) {
      addResult(n, 'city', 4);
    } else if (cityLower.startsWith(lower)) {
      addResult(n, 'city', 5);
    } else if (!hasAliasMatch && cityLower.includes(lower)) {
      addResult(n, 'city', 5.5);
    }
  }

  // 6. Combo component name matches
  for (const n of neighborhoods) {
    if (n.combo_component_names) {
      const match = n.combo_component_names.find((c) => c.toLowerCase().includes(lower));
      if (match) {
        addResult(n, 'component', 6, match);
      }
    }
  }

  // 7. State/province match
  const stateMatch = findStateForQuery(query);
  if (stateMatch) {
    const stateCities = new Set(stateMatch.cities?.map((c) => c.toLowerCase()) || []);
    const stateIds = new Set(stateMatch.neighborhoodIds || []);
    for (const n of neighborhoods) {
      if (stateCities.has(n.city.toLowerCase()) || stateIds.has(n.id)) {
        addResult(n, 'state', 7, stateMatch.label);
      }
    }
  }

  // 8. Country match
  const countryMatch = findCountryForQuery(query);
  if (countryMatch) {
    for (const n of neighborhoods) {
      if (n.country?.toLowerCase() === countryMatch.toLowerCase()) {
        addResult(n, 'country', 8, countryMatch);
      }
    }
  }

  // 9. Region match
  const regionMatch = findRegionForQuery(query);
  if (regionMatch) {
    for (const n of neighborhoods) {
      if (n.region === regionMatch) {
        addResult(n, 'region', 9, regionMatch);
      }
    }
  }

  return results.sort((a, b) => a.score - b.score);
}

/** Check if a search matched a broad category (country/region/state) */
export function isBroadSearch(results: SearchResult<unknown>[]): boolean {
  if (results.length === 0) return false;
  // If the best result is a country/region/state match (no name/city/component matches)
  const bestScore = results[0].score;
  return bestScore >= 7;
}

/** Group search results by city for broad queries */
export function groupResultsByCity<T extends Searchable>(
  results: SearchResult<T>[]
): { city: string; items: SearchResult<T>[] }[] {
  const groups = new Map<string, SearchResult<T>[]>();
  for (const r of results) {
    const city = r.item.city;
    if (!groups.has(city)) groups.set(city, []);
    groups.get(city)!.push(r);
  }
  return Array.from(groups.entries())
    .map(([city, items]) => ({ city, items }))
    .sort((a, b) => a.city.localeCompare(b.city));
}
