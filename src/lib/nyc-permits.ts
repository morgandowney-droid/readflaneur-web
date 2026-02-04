/**
 * NYC DOB Permits Fetcher
 *
 * Fetches building permits from NYC Open Data (DOB Job Application Filings)
 * API: https://data.cityofnewyork.us/resource/ipu4-2q9a.json (SODA API)
 *
 * Geofenced to Flâneur NYC coverage areas via zip code filtering.
 */

import {
  ALL_TARGET_ZIPS,
  getNeighborhoodKeyFromZip,
  NEIGHBORHOOD_ID_TO_CONFIG,
} from '@/config/nyc-locations';

// NYC Open Data endpoint for DOB Job Application Filings
const NYC_PERMITS_API = 'https://data.cityofnewyork.us/resource/ipu4-2q9a.json';

// App token for higher rate limits (optional but recommended)
const NYC_OPEN_DATA_APP_TOKEN = process.env.NYC_OPEN_DATA_APP_TOKEN;

export interface NYCPermit {
  job_number: string;
  permit_type: string;
  filing_date: string;
  job_description: string;
  zip_code: string;
  address: string;
  borough: string;
  /** Assigned Flâneur neighborhood key */
  flaneur_neighborhood: string | null;
  /** Flâneur neighborhood ID (URL slug) */
  neighborhood_id: string | null;
  /** Raw data from API */
  raw_data: Record<string, unknown>;
}

interface DOBPermitResponse {
  job__: string;
  doc_type: string;
  job_type: string;
  job_desc: string;
  filing_date: string;
  pre__filing_date?: string;
  block: string;
  lot: string;
  bin__: string;
  house__: string;
  street_name: string;
  borough: string;
  zip_code: string;
  bldg_type: string;
  residential: string;
  special_district_1?: string;
  special_district_2?: string;
  owner_type: string;
  owner_s_first_name: string;
  owner_s_last_name: string;
  owner_s_business_name?: string;
  owner_s_house__: string;
  owner_s_house_street: string;
  city__: string;
  state: string;
  owner_s_zip_code: string;
  applicant_s_first_name: string;
  applicant_s_last_name: string;
  applicant_professional_title: string;
  applicant_license__: string;
  professional_cert: string;
  filing_status: string;
  filing_representative_first_name?: string;
  filing_representative_last_name?: string;
  filing_representative_title?: string;
  fee_status: string;
  total_construction_floor_area?: string;
  existing_no_of_stories?: string;
  proposed_no_of_stories?: string;
  existing_height?: string;
  proposed_height?: string;
  existing_dwelling_units?: string;
  proposed_dwelling_units?: string;
  total_est_fee?: string;
  existing_occupancy?: string;
  proposed_occupancy?: string;
  fully_permitted?: string;
  initial_cost?: string;
}

/**
 * Build SODA query for NYC permits
 */
function buildPermitsQuery(since?: Date, limit = 1000): string {
  const params = new URLSearchParams();

  // Filter by our target zip codes
  const zipFilter = ALL_TARGET_ZIPS.map((z) => `'${z}'`).join(',');
  let whereClause = `zip_code IN (${zipFilter})`;

  // Add date filter if provided
  if (since) {
    const sinceStr = since.toISOString().split('T')[0];
    whereClause += ` AND filing_date >= '${sinceStr}'`;
  }

  params.set('$where', whereClause);
  params.set('$order', 'filing_date DESC');
  params.set('$limit', limit.toString());

  // Add app token if available
  if (NYC_OPEN_DATA_APP_TOKEN) {
    params.set('$$app_token', NYC_OPEN_DATA_APP_TOKEN);
  }

  return params.toString();
}

/**
 * Map API response to our NYCPermit interface
 */
function mapPermitResponse(record: DOBPermitResponse): NYCPermit {
  const address = `${record.house__ || ''} ${record.street_name || ''}`.trim();
  const neighborhoodKey = getNeighborhoodKeyFromZip(record.zip_code, address);

  // Convert neighborhood key to ID (URL slug)
  let neighborhoodId: string | null = null;
  if (neighborhoodKey) {
    for (const [id, key] of Object.entries(NEIGHBORHOOD_ID_TO_CONFIG)) {
      if (key === neighborhoodKey) {
        neighborhoodId = id;
        break;
      }
    }
  }

  return {
    job_number: record.job__ || '',
    permit_type: record.job_type || record.doc_type || 'Unknown',
    filing_date: record.filing_date || '',
    job_description: record.job_desc || '',
    zip_code: record.zip_code || '',
    address,
    borough: record.borough || '',
    flaneur_neighborhood: neighborhoodKey,
    neighborhood_id: neighborhoodId,
    raw_data: record as unknown as Record<string, unknown>,
  };
}

/**
 * Fetch NYC DOB permits from Open Data API
 *
 * @param since - Only fetch permits filed after this date
 * @param limit - Maximum number of records to fetch (default 1000)
 */
export async function fetchNYCPermits(
  since?: Date,
  limit = 1000
): Promise<NYCPermit[]> {
  const query = buildPermitsQuery(since, limit);
  const url = `${NYC_PERMITS_API}?${query}`;

  console.log(`Fetching NYC permits from: ${url.substring(0, 100)}...`);

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

    const data: DOBPermitResponse[] = await response.json();
    console.log(`Fetched ${data.length} permit records`);

    // Map and filter to our target neighborhoods
    const permits = data
      .map(mapPermitResponse)
      .filter((p) => p.flaneur_neighborhood !== null);

    console.log(`${permits.length} permits matched to Flâneur neighborhoods`);

    return permits;
  } catch (error) {
    console.error('Failed to fetch NYC permits:', error);
    throw error;
  }
}

/**
 * Get permits for a specific neighborhood
 */
export async function fetchPermitsForNeighborhood(
  neighborhoodId: string,
  since?: Date,
  limit = 100
): Promise<NYCPermit[]> {
  const allPermits = await fetchNYCPermits(since, limit * 3);
  return allPermits.filter((p) => p.neighborhood_id === neighborhoodId);
}

/**
 * Categorize permit by type for content generation
 */
export function categorizePermit(permit: NYCPermit): string {
  const desc = permit.job_description.toLowerCase();
  const type = permit.permit_type.toLowerCase();

  // Restaurant/Food service
  if (
    desc.includes('restaurant') ||
    desc.includes('food') ||
    desc.includes('kitchen') ||
    desc.includes('cafe') ||
    desc.includes('bar') ||
    desc.includes('dining')
  ) {
    return 'restaurant';
  }

  // Retail
  if (
    desc.includes('retail') ||
    desc.includes('store') ||
    desc.includes('shop') ||
    desc.includes('boutique')
  ) {
    return 'retail';
  }

  // Residential new construction
  if (
    type.includes('new building') ||
    desc.includes('new building') ||
    desc.includes('construct new')
  ) {
    return 'new_construction';
  }

  // Residential renovation
  if (
    desc.includes('residential') ||
    desc.includes('apartment') ||
    desc.includes('dwelling')
  ) {
    return 'residential';
  }

  // Commercial
  if (
    desc.includes('office') ||
    desc.includes('commercial') ||
    desc.includes('business')
  ) {
    return 'commercial';
  }

  // Rooftop/outdoor
  if (
    desc.includes('rooftop') ||
    desc.includes('roof deck') ||
    desc.includes('outdoor') ||
    desc.includes('terrace')
  ) {
    return 'rooftop';
  }

  return 'general';
}

/**
 * Get notable permits worth mentioning in content
 * Filters for interesting permit types (restaurants, new construction, etc.)
 */
export function filterNotablePermits(permits: NYCPermit[]): NYCPermit[] {
  const notableCategories = [
    'restaurant',
    'retail',
    'new_construction',
    'rooftop',
  ];

  return permits.filter((p) => {
    const category = categorizePermit(p);
    return notableCategories.includes(category);
  });
}
