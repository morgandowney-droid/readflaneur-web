/**
 * NYC Crime Stats Fetcher
 *
 * Fetches crime statistics from NYC Open Data (NYPD Complaint Data)
 * API: https://data.cityofnewyork.us/resource/qb7u-rbmr.json (SODA API)
 *
 * Filtered by police precinct (not zip code) and aggregated for combo neighborhoods.
 */

import {
  FLANEUR_NYC_CONFIG,
  NEIGHBORHOOD_ID_TO_CONFIG,
} from '@/config/nyc-locations';

// NYC Open Data endpoint for NYPD Complaint Data Current (Year To Date)
const NYC_CRIME_API = 'https://data.cityofnewyork.us/resource/qb7u-rbmr.json';

// App token for higher rate limits (optional)
const NYC_OPEN_DATA_APP_TOKEN = process.env.NYC_OPEN_DATA_APP_TOKEN;

export interface CrimeStats {
  /** Flâneur neighborhood key */
  flaneur_neighborhood: string;
  /** Flâneur neighborhood ID (URL slug) */
  neighborhood_id: string | null;
  /** Period covered */
  period_start: string;
  period_end: string;
  /** Total incidents in period */
  total_incidents: number;
  /** Breakdown by offense category */
  by_category: Record<string, number>;
  /** Precincts included in this aggregation */
  precincts_included: string[];
  /** Raw incident data */
  raw_data: CrimeIncident[];
}

export interface CrimeIncident {
  cmplnt_num: string;
  cmplnt_fr_dt: string;
  cmplnt_fr_tm: string;
  addr_pct_cd: string; // Precinct
  ofns_desc: string;
  law_cat_cd: string; // FELONY, MISDEMEANOR, VIOLATION
  boro_nm: string;
  loc_of_occur_desc: string;
  prem_typ_desc: string;
  latitude?: string;
  longitude?: string;
}

interface NYPDComplaintResponse {
  cmplnt_num: string;
  cmplnt_fr_dt: string;
  cmplnt_fr_tm?: string;
  cmplnt_to_dt?: string;
  cmplnt_to_tm?: string;
  addr_pct_cd: string;
  rpt_dt?: string;
  ky_cd?: string;
  ofns_desc: string;
  pd_cd?: string;
  pd_desc?: string;
  crm_atpt_cptd_cd?: string;
  law_cat_cd: string;
  boro_nm: string;
  loc_of_occur_desc?: string;
  prem_typ_desc?: string;
  juris_desc?: string;
  jurisdiction_code?: string;
  parks_nm?: string;
  hadevelopt?: string;
  housing_psa?: string;
  x_coord_cd?: string;
  y_coord_cd?: string;
  susp_age_group?: string;
  susp_race?: string;
  susp_sex?: string;
  transit_district?: string;
  latitude?: string;
  longitude?: string;
  lat_lon?: {
    latitude: string;
    longitude: string;
  };
  patrol_boro?: string;
  station_name?: string;
  vic_age_group?: string;
  vic_race?: string;
  vic_sex?: string;
}

/**
 * Extract precinct number from precinct string
 * e.g., "10th Precinct" -> "10", "Midtown South Precinct" -> null
 */
function extractPrecinctNumber(precinctStr: string): string | null {
  const match = precinctStr.match(/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Get precinct codes for a neighborhood
 */
function getPrecinctCodes(neighborhoodKey: string): string[] {
  const config = FLANEUR_NYC_CONFIG[neighborhoodKey];
  if (!config) return [];

  const codes: string[] = [];
  for (const precinct of config.precincts) {
    const num = extractPrecinctNumber(precinct);
    if (num) {
      codes.push(num);
    }
  }
  return codes;
}

/**
 * Build SODA query for NYC crime stats
 */
function buildCrimeQuery(
  precinctCodes: string[],
  since: Date,
  until: Date,
  limit = 10000
): string {
  const params = new URLSearchParams();

  // Filter by precinct codes
  const precinctFilter = precinctCodes.map((p) => `'${p}'`).join(',');
  const sinceStr = since.toISOString().split('T')[0];
  const untilStr = until.toISOString().split('T')[0];

  const whereClause = `addr_pct_cd IN (${precinctFilter}) AND cmplnt_fr_dt >= '${sinceStr}' AND cmplnt_fr_dt <= '${untilStr}'`;

  params.set('$where', whereClause);
  params.set('$order', 'cmplnt_fr_dt DESC');
  params.set('$limit', limit.toString());

  // Add app token if available
  if (NYC_OPEN_DATA_APP_TOKEN) {
    params.set('$$app_token', NYC_OPEN_DATA_APP_TOKEN);
  }

  return params.toString();
}

/**
 * Map API response to CrimeIncident
 */
function mapIncidentResponse(record: NYPDComplaintResponse): CrimeIncident {
  return {
    cmplnt_num: record.cmplnt_num || '',
    cmplnt_fr_dt: record.cmplnt_fr_dt || '',
    cmplnt_fr_tm: record.cmplnt_fr_tm || '',
    addr_pct_cd: record.addr_pct_cd || '',
    ofns_desc: record.ofns_desc || 'Unknown',
    law_cat_cd: record.law_cat_cd || '',
    boro_nm: record.boro_nm || '',
    loc_of_occur_desc: record.loc_of_occur_desc || '',
    prem_typ_desc: record.prem_typ_desc || '',
    latitude: record.latitude,
    longitude: record.longitude,
  };
}

/**
 * Aggregate incidents into category counts
 */
function aggregateByCategory(
  incidents: CrimeIncident[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const incident of incidents) {
    const category = normalizeOffenseCategory(incident.ofns_desc);
    counts[category] = (counts[category] || 0) + 1;
  }

  return counts;
}

/**
 * Normalize offense descriptions into broader categories
 */
function normalizeOffenseCategory(offense: string): string {
  const lower = offense.toLowerCase();

  if (lower.includes('larceny') || lower.includes('theft')) {
    return 'Theft/Larceny';
  }
  if (lower.includes('assault')) {
    return 'Assault';
  }
  if (lower.includes('burglary')) {
    return 'Burglary';
  }
  if (lower.includes('robbery')) {
    return 'Robbery';
  }
  if (
    lower.includes('fraud') ||
    lower.includes('forgery') ||
    lower.includes('identity')
  ) {
    return 'Fraud';
  }
  if (lower.includes('harassment')) {
    return 'Harassment';
  }
  if (lower.includes('criminal mischief') || lower.includes('vandalism')) {
    return 'Vandalism';
  }
  if (lower.includes('drug') || lower.includes('controlled substance')) {
    return 'Drug Offenses';
  }
  if (lower.includes('vehicle')) {
    return 'Vehicle-Related';
  }
  if (lower.includes('weapon') || lower.includes('firearm')) {
    return 'Weapons';
  }
  if (lower.includes('sex') || lower.includes('rape')) {
    return 'Sex Crimes';
  }
  if (lower.includes('homicide') || lower.includes('murder')) {
    return 'Homicide';
  }
  if (lower.includes('trespass')) {
    return 'Trespassing';
  }

  return 'Other';
}

/**
 * Fetch crime stats for a specific neighborhood
 *
 * @param neighborhoodKey - Flâneur neighborhood config key
 * @param period - 'week' or 'month'
 */
export async function fetchCrimeStatsForNeighborhood(
  neighborhoodKey: string,
  period: 'week' | 'month' = 'week'
): Promise<CrimeStats | null> {
  const config = FLANEUR_NYC_CONFIG[neighborhoodKey];
  if (!config) {
    console.error(`Unknown neighborhood: ${neighborhoodKey}`);
    return null;
  }

  // Get precinct codes
  const precinctCodes = getPrecinctCodes(neighborhoodKey);
  if (precinctCodes.length === 0) {
    console.warn(`No precinct codes found for ${neighborhoodKey}`);
    return null;
  }

  // Calculate date range
  const until = new Date();
  const since = new Date();
  if (period === 'week') {
    since.setDate(since.getDate() - 7);
  } else {
    since.setMonth(since.getMonth() - 1);
  }

  const query = buildCrimeQuery(precinctCodes, since, until);
  const url = `${NYC_CRIME_API}?${query}`;

  console.log(`Fetching crime stats for ${neighborhoodKey} from: ${url.substring(0, 100)}...`);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `NYC Open Data API error: ${response.status} - ${errorText.substring(0, 200)}`
      );
    }

    const data: NYPDComplaintResponse[] = await response.json();
    console.log(`Fetched ${data.length} crime records for ${neighborhoodKey}`);

    const incidents = data.map(mapIncidentResponse);
    const byCategory = aggregateByCategory(incidents);

    // Get neighborhood ID
    let neighborhoodId: string | null = null;
    for (const [id, key] of Object.entries(NEIGHBORHOOD_ID_TO_CONFIG)) {
      if (key === neighborhoodKey) {
        neighborhoodId = id;
        break;
      }
    }

    return {
      flaneur_neighborhood: neighborhoodKey,
      neighborhood_id: neighborhoodId,
      period_start: since.toISOString().split('T')[0],
      period_end: until.toISOString().split('T')[0],
      total_incidents: incidents.length,
      by_category: byCategory,
      precincts_included: config.precincts,
      raw_data: incidents,
    };
  } catch (error) {
    console.error(`Failed to fetch crime stats for ${neighborhoodKey}:`, error);
    throw error;
  }
}

/**
 * Fetch crime stats for all NYC neighborhoods
 *
 * @param period - 'week' or 'month'
 */
export async function fetchCrimeStats(
  period: 'week' | 'month' = 'week'
): Promise<CrimeStats[]> {
  const results: CrimeStats[] = [];

  // Get all unique neighborhood keys (excluding component-only neighborhoods for combos)
  const neighborhoodKeys = Object.keys(FLANEUR_NYC_CONFIG).filter((key) => {
    const config = FLANEUR_NYC_CONFIG[key];
    // Include if it's not a component of another combo
    // (we'll aggregate combos separately)
    return !isComponentOnly(key);
  });

  for (const key of neighborhoodKeys) {
    try {
      const stats = await fetchCrimeStatsForNeighborhood(key, period);
      if (stats) {
        results.push(stats);
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`Failed to fetch stats for ${key}:`, error);
    }
  }

  return results;
}

/**
 * Check if a neighborhood is only a component (not served directly)
 */
function isComponentOnly(neighborhoodKey: string): boolean {
  // These neighborhoods are components of combos and not served directly
  const componentOnlyKeys = ['Dumbo', 'Cobble Hill', 'Park Slope', 'NoHo', 'Nolita'];
  return componentOnlyKeys.includes(neighborhoodKey);
}

/**
 * Get a human-readable summary of crime stats
 */
export function summarizeCrimeStats(stats: CrimeStats): string {
  const topCategories = Object.entries(stats.by_category)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, count]) => `${cat} (${count})`)
    .join(', ');

  return `${stats.total_incidents} incidents reported. Top categories: ${topCategories}`;
}

/**
 * Compare crime stats to previous period
 */
export function compareToPreviousPeriod(
  current: CrimeStats,
  previous: CrimeStats
): {
  totalChange: number;
  percentChange: number;
  categoryChanges: Record<string, number>;
} {
  const totalChange = current.total_incidents - previous.total_incidents;
  const percentChange =
    previous.total_incidents > 0
      ? (totalChange / previous.total_incidents) * 100
      : 0;

  const categoryChanges: Record<string, number> = {};
  const allCategories = new Set([
    ...Object.keys(current.by_category),
    ...Object.keys(previous.by_category),
  ]);

  for (const cat of allCategories) {
    const currentCount = current.by_category[cat] || 0;
    const previousCount = previous.by_category[cat] || 0;
    categoryChanges[cat] = currentCount - previousCount;
  }

  return {
    totalChange,
    percentChange: Math.round(percentChange * 10) / 10,
    categoryChanges,
  };
}
