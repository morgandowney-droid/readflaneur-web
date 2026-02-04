/**
 * Los Angeles City Adapter
 *
 * Fetches civic data from LA Open Data and related sources:
 * - Permits: LA Building & Safety permits
 * - Liquor: ABC (Alcoholic Beverage Control) licenses
 * - Safety: LAPD crime data
 *
 * Data is filtered to Flâneur coverage zones (Beverly Hills, Bel Air, etc.)
 * Note: Beverly Hills and Santa Monica are separate cities with their own data sources.
 */

import {
  BaseCityAdapter,
  StoryData,
  SafetyStats,
  CityVocabulary,
} from './types';
import {
  GLOBAL_CITY_CONFIG,
  CITY_VOCABULARIES,
} from '@/config/global-locations';

// LA City Open Data (Socrata-based)
const LA_PERMITS_API = 'https://data.lacity.org/resource/yv23-pmwf.json';
const LA_CRIMES_API = 'https://data.lacity.org/resource/2nrs-mtv8.json';

// Beverly Hills Open Data
const BH_PERMITS_API = 'https://data.beverlyhills.org/resource/';

// California ABC License Query
const CA_ABC_SEARCH = 'https://www.abc.ca.gov/licensing/license-query-database/';

// Optional: Socrata app token
const SOCRATA_APP_TOKEN = process.env.SOCRATA_APP_TOKEN;

/**
 * Los Angeles adapter for California civic data
 */
export class LosAngelesAdapter extends BaseCityAdapter {
  readonly city = 'Los Angeles';
  readonly country = 'USA';
  readonly currency = 'USD';
  readonly vocabulary: CityVocabulary;

  // Neighborhood Council area codes
  private readonly neighborhoodCouncils: Record<string, string[]> = {
    'bel-air': ['Bel Air-Beverly Crest'],
    'pacific-palisades': ['Pacific Palisades'],
    brentwood: ['Brentwood'],
    // Beverly Hills and Santa Monica are separate cities
    'beverly-hills': ['Beverly Hills'],
    'santa-monica': ['Santa Monica'],
  };

  constructor() {
    super(GLOBAL_CITY_CONFIG['Los Angeles']);
    this.vocabulary = CITY_VOCABULARIES['Los Angeles'];
  }

  /**
   * Fetch building permits from LA Open Data
   *
   * Filters for:
   * - Permit valuation > $1,000,000
   * - Luxury keywords: pool, compound, hillside
   * - Coverage zones
   */
  async getPermits(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const permits: StoryData[] = [];

    try {
      // Fetch from LA City
      const laPermits = await this.fetchLAPermits(sinceDate);
      permits.push(...laPermits);

      // Beverly Hills is a separate city - would need separate API
      // Santa Monica is a separate city - would need separate API

      // Filter for luxury indicators
      return permits.filter((p) => {
        const meetsValue = p.value && p.value >= 1000000;
        const hasKeywords = this.hasLuxuryKeywords(`${p.title} ${p.description}`);
        return meetsValue || hasKeywords;
      });
    } catch (error) {
      console.error('LA permits fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch permits from LA City Open Data
   */
  private async fetchLAPermits(since: Date): Promise<StoryData[]> {
    const sinceStr = since.toISOString().split('T')[0];

    // Get zip codes for our coverage zones in LA City
    const coverageZips = new Set<string>();
    for (const zone of this.config.zones) {
      // Only LA City zones (not Beverly Hills or Santa Monica)
      if (['bel-air', 'pacific-palisades', 'brentwood'].includes(zone.neighborhoodId)) {
        zone.postalCodes?.forEach((z) => coverageZips.add(z));
      }
    }

    const zipList = Array.from(coverageZips).map((z) => `'${z}'`).join(',');

    try {
      const whereClause = `issue_date >= '${sinceStr}' AND zip_code IN (${zipList}) AND valuation > 500000`;

      const params = new URLSearchParams({
        $where: whereClause,
        $order: 'issue_date DESC',
        $limit: '300',
      });

      if (SOCRATA_APP_TOKEN) {
        params.set('$$app_token', SOCRATA_APP_TOKEN);
      }

      const url = `${LA_PERMITS_API}?${params}`;
      console.log(`Fetching LA permits: ${url.substring(0, 100)}...`);

      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        console.error(`LA permits API error: ${response.status}`);
        return [];
      }

      const data = await response.json();
      console.log(`Fetched ${data.length} LA permit records`);

      return data.map((permit: Record<string, unknown>) => {
        const address = String(permit.address || permit.address_start || '');
        const zip = String(permit.zip_code || '').substring(0, 5);
        const neighborhoodId = this.mapZipToNeighborhood(zip, address);

        return {
          sourceId: String(permit.permit_nbr || permit.pcis_permit || ''),
          dataType: 'permit' as const,
          address,
          zone: this.getZoneName(zip),
          neighborhoodId,
          date: String(permit.issue_date || permit.permit_issue_date || ''),
          title: String(permit.work_description || permit.permit_type || 'Building Permit').substring(0, 100),
          description: String(permit.work_description || ''),
          value: parseFloat(String(permit.valuation || permit.permit_valuation || '0')),
          currency: 'USD',
          category: String(permit.permit_type || permit.permit_sub_type || ''),
          rawData: permit,
        };
      }).filter((p: StoryData) => p.neighborhoodId !== null);
    } catch (error) {
      console.error('LA permits fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch liquor licenses from California ABC
   *
   * ABC licenses are statewide - filter by address/city
   */
  async getLiquor(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    try {
      // California ABC doesn't have a public API
      // License lookups are done through their website
      // https://www.abc.ca.gov/licensing/license-query-database/

      console.log(`Would fetch CA ABC licenses since ${sinceDate.toISOString()}`);

      // Placeholder - would need scraping or their license data file
      return [];
    } catch (error) {
      console.error('LA liquor fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch crime statistics from LAPD data
   */
  async getSafety(period: 'week' | 'month' = 'week'): Promise<SafetyStats[]> {
    const stats: SafetyStats[] = [];

    const periodEnd = new Date();
    const periodStart = new Date();
    if (period === 'week') {
      periodStart.setDate(periodStart.getDate() - 7);
    } else {
      periodStart.setMonth(periodStart.getMonth() - 1);
    }

    try {
      // LA City zones only (Beverly Hills and Santa Monica have separate police)
      const laZones = this.config.zones.filter((z) =>
        ['bel-air', 'pacific-palisades', 'brentwood'].includes(z.neighborhoodId)
      );

      for (const zone of laZones) {
        const zoneStats = await this.fetchLAPDData(zone.neighborhoodId, periodStart, periodEnd);
        if (zoneStats) {
          stats.push(zoneStats);
        }
      }

      return stats;
    } catch (error) {
      console.error('LA safety fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch crime data from LAPD dataset
   */
  private async fetchLAPDData(
    neighborhoodId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<SafetyStats | null> {
    const zone = this.config.zones.find((z) => z.neighborhoodId === neighborhoodId);
    if (!zone || !zone.postalCodes) return null;

    const startStr = periodStart.toISOString().split('T')[0];

    try {
      // LAPD data uses area codes, not zip codes directly
      // We'll filter by approximate lat/long or cross streets

      const params = new URLSearchParams({
        $where: `date_occ >= '${startStr}'`,
        $select: 'crm_cd_desc, count(*) as count',
        $group: 'crm_cd_desc',
        $limit: '50',
      });

      if (SOCRATA_APP_TOKEN) {
        params.set('$$app_token', SOCRATA_APP_TOKEN);
      }

      const url = `${LA_CRIMES_API}?${params}`;

      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        console.error(`LAPD API error: ${response.status}`);
        return null;
      }

      const data = await response.json();

      // Aggregate by category
      const byCategory: Record<string, number> = {};
      let total = 0;

      for (const row of data) {
        const category = String(row.crm_cd_desc || 'OTHER');
        const count = parseInt(String(row.count || '0'), 10);
        byCategory[category] = count;
        total += count;
      }

      return {
        zone: zone.name,
        neighborhoodId,
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        totalIncidents: total,
        byCategory,
      };
    } catch (error) {
      console.error(`Failed to fetch LAPD data for ${neighborhoodId}:`, error);
      return null;
    }
  }

  /**
   * Map zip code to neighborhood
   */
  private mapZipToNeighborhood(zip: string, address: string): string | null {
    const upper = address.toUpperCase();

    // Check specific zones
    for (const zone of this.config.zones) {
      if (zone.postalCodes?.includes(zip)) {
        return zone.neighborhoodId;
      }
    }

    // Try address-based matching
    if (upper.includes('BEL AIR') || upper.includes('BELLAGIO')) {
      return 'bel-air';
    }
    if (upper.includes('PACIFIC PALISADES') || upper.includes('PALISADES')) {
      return 'pacific-palisades';
    }
    if (upper.includes('BRENTWOOD')) {
      return 'brentwood';
    }
    if (upper.includes('BEVERLY HILLS')) {
      return 'beverly-hills';
    }
    if (upper.includes('SANTA MONICA')) {
      return 'santa-monica';
    }

    return null;
  }

  /**
   * Get zone name from zip
   */
  private getZoneName(zip: string): string {
    const zipToZone: Record<string, string> = {
      '90077': 'Bel Air',
      '90272': 'Pacific Palisades',
      '90049': 'Brentwood',
      '90210': 'Beverly Hills',
      '90211': 'Beverly Hills',
      '90212': 'Beverly Hills',
      '90401': 'Santa Monica',
      '90402': 'Santa Monica',
      '90403': 'Santa Monica',
    };
    return zipToZone[zip] || 'Los Angeles';
  }

  /**
   * Check for luxury keywords specific to LA
   */
  protected hasLuxuryKeywords(text: string): boolean {
    const laKeywords = [
      'compound',
      'estate',
      'canyon',
      'hillside',
      'bird streets',
      'flats',
      'pool house',
      'guest house',
      'tennis court',
      'motor court',
      'wine cellar',
      'theater',
      'theatre',
      'gym',
      'spa',
      'cabana',
      'infinity pool',
      'ocean view',
      'city view',
      'celebrity',
    ];

    const lower = text.toLowerCase();
    return laKeywords.some((kw) => lower.includes(kw)) || super.hasLuxuryKeywords(text);
  }
}
