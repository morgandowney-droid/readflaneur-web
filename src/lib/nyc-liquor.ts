/**
 * NYC Liquor License Fetcher
 *
 * Fetches liquor licenses from NY State Open Data (SLA Licenses)
 * API: https://data.ny.gov/resource/wg8y-fzsj.json (SODA API)
 *
 * Filtered to NYC zip codes within Flâneur coverage areas.
 */

import {
  ALL_TARGET_ZIPS,
  getNeighborhoodKeyFromZip,
  NEIGHBORHOOD_ID_TO_CONFIG,
} from '@/config/nyc-locations';

// NY State Open Data endpoint for SLA Liquor Authority licenses
const NY_LIQUOR_API = 'https://data.ny.gov/resource/wg8y-fzsj.json';

// App token for higher rate limits (optional)
const NY_OPEN_DATA_APP_TOKEN = process.env.NY_OPEN_DATA_APP_TOKEN;

export interface LiquorLicense {
  serial_number: string;
  license_type: string;
  license_type_code: string;
  premises_name: string;
  effective_date: string;
  expiration_date: string;
  zip_code: string;
  address: string;
  city: string;
  county: string;
  /** Assigned Flâneur neighborhood key */
  flaneur_neighborhood: string | null;
  /** Flâneur neighborhood ID (URL slug) */
  neighborhood_id: string | null;
  /** Raw data from API */
  raw_data: Record<string, unknown>;
}

interface SLALicenseResponse {
  serial_number: string;
  license_type_name: string;
  license_type_code: string;
  license_class_code: string;
  license_class_name: string;
  license_certificate_number?: string;
  agency_zone_office?: string;
  county_name: string;
  premises_name: string;
  doing_business_as_dba?: string;
  actual_address_of_premises_address1: string;
  actual_address_of_premises_address2?: string;
  actual_address_of_premises_city: string;
  actual_address_of_premises_state: string;
  actual_address_of_premises_zip_code: string;
  license_original_issue_date?: string;
  license_effective_date: string;
  license_expiration_date: string;
  method_of_operation?: string;
  principal_name?: string;
  geographic_code?: string;
}

/**
 * Build SODA query for NY liquor licenses
 */
function buildLiquorQuery(since?: Date, limit = 1000): string {
  const params = new URLSearchParams();

  // Filter by our target zip codes (NYC only)
  const zipFilter = ALL_TARGET_ZIPS.map((z) => `'${z}'`).join(',');

  // Also filter to NYC counties for extra assurance
  const nycCounties = ['NEW YORK', 'KINGS', 'QUEENS', 'BRONX', 'RICHMOND'];
  const countyFilter = nycCounties.map((c) => `'${c}'`).join(',');

  let whereClause = `actual_address_of_premises_zip_code IN (${zipFilter})`;
  whereClause += ` AND county_name IN (${countyFilter})`;

  // Add date filter if provided
  if (since) {
    const sinceStr = since.toISOString().split('T')[0];
    whereClause += ` AND license_effective_date >= '${sinceStr}'`;
  }

  params.set('$where', whereClause);
  params.set('$order', 'license_effective_date DESC');
  params.set('$limit', limit.toString());

  // Add app token if available
  if (NY_OPEN_DATA_APP_TOKEN) {
    params.set('$$app_token', NY_OPEN_DATA_APP_TOKEN);
  }

  return params.toString();
}

/**
 * Map API response to our LiquorLicense interface
 */
function mapLicenseResponse(record: SLALicenseResponse): LiquorLicense {
  const address = [
    record.actual_address_of_premises_address1,
    record.actual_address_of_premises_address2,
  ]
    .filter(Boolean)
    .join(', ');

  const zipCode = record.actual_address_of_premises_zip_code || '';
  const neighborhoodKey = getNeighborhoodKeyFromZip(zipCode, address);

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
    serial_number: record.serial_number || '',
    license_type: record.license_type_name || '',
    license_type_code: record.license_type_code || '',
    premises_name: record.doing_business_as_dba || record.premises_name || '',
    effective_date: record.license_effective_date || '',
    expiration_date: record.license_expiration_date || '',
    zip_code: zipCode,
    address,
    city: record.actual_address_of_premises_city || '',
    county: record.county_name || '',
    flaneur_neighborhood: neighborhoodKey,
    neighborhood_id: neighborhoodId,
    raw_data: record as unknown as Record<string, unknown>,
  };
}

/**
 * Fetch NY State liquor licenses from Open Data API
 *
 * @param since - Only fetch licenses effective after this date
 * @param limit - Maximum number of records to fetch (default 1000)
 */
export async function fetchLiquorLicenses(
  since?: Date,
  limit = 1000
): Promise<LiquorLicense[]> {
  const query = buildLiquorQuery(since, limit);
  const url = `${NY_LIQUOR_API}?${query}`;

  console.log(`Fetching liquor licenses from: ${url.substring(0, 100)}...`);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `NY Open Data API error: ${response.status} - ${errorText.substring(0, 200)}`
      );
    }

    const data: SLALicenseResponse[] = await response.json();
    console.log(`Fetched ${data.length} liquor license records`);

    // Map and filter to our target neighborhoods
    const licenses = data
      .map(mapLicenseResponse)
      .filter((l) => l.flaneur_neighborhood !== null);

    console.log(`${licenses.length} licenses matched to Flâneur neighborhoods`);

    return licenses;
  } catch (error) {
    console.error('Failed to fetch liquor licenses:', error);
    throw error;
  }
}

/**
 * Get licenses for a specific neighborhood
 */
export async function fetchLicensesForNeighborhood(
  neighborhoodId: string,
  since?: Date,
  limit = 100
): Promise<LiquorLicense[]> {
  const allLicenses = await fetchLiquorLicenses(since, limit * 3);
  return allLicenses.filter((l) => l.neighborhood_id === neighborhoodId);
}

/**
 * Categorize license by type for content generation
 */
export function categorizeLicense(license: LiquorLicense): string {
  const type = license.license_type.toLowerCase();
  const code = license.license_type_code.toUpperCase();

  // On-premises licenses (restaurants, bars)
  if (code === 'OP' || type.includes('on-premises') || type.includes('on premises')) {
    return 'restaurant_bar';
  }

  // Wine & beer (typically restaurants)
  if (code === 'WB' || type.includes('wine') || type.includes('beer')) {
    return 'wine_beer';
  }

  // Club licenses
  if (code === 'CL' || type.includes('club')) {
    return 'club';
  }

  // Hotel licenses
  if (code === 'HL' || type.includes('hotel')) {
    return 'hotel';
  }

  // Retail/package store
  if (
    code === 'L' ||
    code === 'RL' ||
    type.includes('liquor store') ||
    type.includes('package')
  ) {
    return 'retail';
  }

  // Grocery/wine store
  if (code === 'A' || code === 'AX' || type.includes('grocery')) {
    return 'grocery';
  }

  // Manufacturer/wholesaler
  if (
    type.includes('manufacturer') ||
    type.includes('wholesaler') ||
    type.includes('farm')
  ) {
    return 'manufacturer';
  }

  return 'other';
}

/**
 * Get notable licenses worth mentioning in content
 * Filters for interesting license types (new restaurants, bars, etc.)
 */
export function filterNotableLicenses(licenses: LiquorLicense[]): LiquorLicense[] {
  const notableCategories = ['restaurant_bar', 'wine_beer', 'club', 'hotel'];

  return licenses.filter((l) => {
    const category = categorizeLicense(l);
    return notableCategories.includes(category);
  });
}

/**
 * Check if a license is new (recently issued vs renewal)
 * New licenses are more newsworthy than renewals
 */
export function isNewLicense(license: LiquorLicense): boolean {
  // Check raw data for original issue date
  const raw = license.raw_data as unknown as SLALicenseResponse;

  if (raw.license_original_issue_date) {
    // If original issue date equals effective date, it's a new license
    const original = new Date(raw.license_original_issue_date);
    const effective = new Date(license.effective_date);

    // Within 90 days = new license
    const daysDiff = Math.abs(
      (effective.getTime() - original.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysDiff < 90;
  }

  // If no original date, assume it's new if effective date is recent
  const effective = new Date(license.effective_date);
  const now = new Date();
  const daysSinceEffective =
    (now.getTime() - effective.getTime()) / (1000 * 60 * 60 * 24);

  return daysSinceEffective < 90;
}
