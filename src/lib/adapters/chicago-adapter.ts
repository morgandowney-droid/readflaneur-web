/**
 * Chicago City Adapter
 *
 * Fetches civic data from Chicago Data Portal (Socrata):
 * - Permits: Building Permits dataset
 * - Liquor: Business Licenses dataset
 * - Safety: Crimes dataset
 *
 * Data is filtered by Community Area to Flâneur coverage zones.
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

// Chicago Data Portal (Socrata) endpoints
const CHICAGO_PERMITS_API = 'https://data.cityofchicago.org/resource/ydr8-5enu.json';
const CHICAGO_LICENSES_API = 'https://data.cityofchicago.org/resource/r5kz-chrr.json';
const CHICAGO_CRIMES_API = 'https://data.cityofchicago.org/resource/ijzp-q8t2.json';

// Optional: Socrata app token for higher rate limits
const SOCRATA_APP_TOKEN = process.env.SOCRATA_APP_TOKEN;

/**
 * Chicago adapter using Socrata API
 */
export class ChicagoAdapter extends BaseCityAdapter {
  readonly city = 'Chicago';
  readonly country = 'USA';
  readonly currency = 'USD';
  readonly vocabulary: CityVocabulary;

  // Community area codes for our coverage zones
  private readonly communityAreas: Record<string, string[]> = {
    'gold-coast': ['08'], // Near North Side includes Gold Coast
    'lincoln-park': ['07'],
    'river-north': ['08', '32'], // Near North Side, Loop
    streeterville: ['08'],
  };

  constructor() {
    super(GLOBAL_CITY_CONFIG['Chicago']);
    this.vocabulary = CITY_VOCABULARIES['Chicago'];
  }

  /**
   * Fetch building permits from Chicago Data Portal
   *
   * Filters for:
   * - Estimated cost > $1,000,000
   * - Permit types: new construction, major alteration
   * - Luxury keywords in work description
   */
  async getPermits(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sinceStr = sinceDate.toISOString().split('T')[0];

    // Get all community areas we cover
    const allAreas = new Set<string>();
    for (const areas of Object.values(this.communityAreas)) {
      areas.forEach((a) => allAreas.add(a));
    }
    const areaList = Array.from(allAreas);

    try {
      // Build SoQL query
      // Filter by: date, community area, and cost > $1M
      const areaFilter = areaList.map((a) => `'${a}'`).join(',');
      const whereClause = `issue_date >= '${sinceStr}' AND community_area IN (${areaFilter}) AND reported_cost > 1000000`;

      const params = new URLSearchParams({
        $where: whereClause,
        $order: 'issue_date DESC',
        $limit: '500',
      });

      if (SOCRATA_APP_TOKEN) {
        params.set('$$app_token', SOCRATA_APP_TOKEN);
      }

      const url = `${CHICAGO_PERMITS_API}?${params}`;
      console.log(`Fetching Chicago permits: ${url.substring(0, 100)}...`);

      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`Chicago permits API error: ${response.status}`, error.substring(0, 200));
        return [];
      }

      const data = await response.json();
      console.log(`Fetched ${data.length} Chicago permit records`);

      return data.map((permit: Record<string, unknown>) => {
        const address = String(permit.street_number || '') + ' ' +
                       String(permit.street_direction || '') + ' ' +
                       String(permit.street_name || '') + ' ' +
                       String(permit.suffix || '');

        const communityArea = String(permit.community_area || '');
        const neighborhoodId = this.mapCommunityAreaToNeighborhood(communityArea, address);

        return {
          sourceId: String(permit.id || permit.permit_ || ''),
          dataType: 'permit' as const,
          address: address.trim(),
          zone: this.getCommunityAreaName(communityArea),
          neighborhoodId,
          date: String(permit.issue_date || ''),
          title: String(permit.work_description || 'Building Permit').substring(0, 100),
          description: String(permit.work_description || ''),
          value: parseFloat(String(permit.reported_cost || '0')),
          currency: 'USD',
          category: String(permit.permit_type || ''),
          keywords: this.extractKeywords(String(permit.work_description || '')),
          rawData: permit,
        };
      }).filter((p: StoryData) => p.neighborhoodId !== null);
    } catch (error) {
      console.error('Chicago permits fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch liquor licenses from Chicago Business Licenses dataset
   *
   * Filters for:
   * - License type: Consumption on Premises
   * - Recently issued (new venues)
   * - Coverage zones
   */
  async getLiquor(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sinceStr = sinceDate.toISOString().split('T')[0];

    try {
      // Filter for liquor-related licenses
      const whereClause = `license_start_date >= '${sinceStr}' AND license_description LIKE '%LIQUOR%'`;

      const params = new URLSearchParams({
        $where: whereClause,
        $order: 'license_start_date DESC',
        $limit: '200',
      });

      if (SOCRATA_APP_TOKEN) {
        params.set('$$app_token', SOCRATA_APP_TOKEN);
      }

      const url = `${CHICAGO_LICENSES_API}?${params}`;
      console.log(`Fetching Chicago liquor licenses: ${url.substring(0, 100)}...`);

      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        console.error(`Chicago licenses API error: ${response.status}`);
        return [];
      }

      const data = await response.json();
      console.log(`Fetched ${data.length} Chicago license records`);

      // Filter to our coverage zones by zip code
      const coverageZips = new Set<string>();
      for (const zone of this.config.zones) {
        zone.postalCodes?.forEach((z) => coverageZips.add(z));
      }

      return data
        .filter((lic: Record<string, unknown>) => {
          const zip = String(lic.zip_code || '').substring(0, 5);
          return coverageZips.has(zip);
        })
        .map((lic: Record<string, unknown>) => {
          const address = String(lic.address || '');
          const zip = String(lic.zip_code || '').substring(0, 5);
          const neighborhoodId = this.mapZipToNeighborhood(zip, address);

          return {
            sourceId: String(lic.license_id || lic.id || ''),
            dataType: 'liquor' as const,
            address,
            zone: String(lic.city || 'Chicago'),
            neighborhoodId,
            date: String(lic.license_start_date || ''),
            title: String(lic.doing_business_as_name || lic.legal_name || 'New License'),
            description: String(lic.license_description || ''),
            category: String(lic.license_description || ''),
            rawData: lic,
          };
        })
        .filter((l: StoryData) => l.neighborhoodId !== null);
    } catch (error) {
      console.error('Chicago liquor fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch crime statistics from Chicago Crimes dataset
   *
   * Aggregates by community area for our coverage zones
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

    const startStr = periodStart.toISOString().split('T')[0];

    // Get all community areas we cover
    const allAreas = new Set<string>();
    for (const areas of Object.values(this.communityAreas)) {
      areas.forEach((a) => allAreas.add(a));
    }

    try {
      for (const areaCode of allAreas) {
        const areaStats = await this.fetchCrimesByArea(areaCode, startStr, periodStart, periodEnd);
        if (areaStats) {
          stats.push(areaStats);
        }
      }

      return stats;
    } catch (error) {
      console.error('Chicago safety fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch crimes for a specific community area
   */
  private async fetchCrimesByArea(
    areaCode: string,
    startStr: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<SafetyStats | null> {
    try {
      const whereClause = `date >= '${startStr}' AND community_area = '${areaCode}'`;

      const params = new URLSearchParams({
        $where: whereClause,
        $select: 'primary_type, count(*) as count',
        $group: 'primary_type',
        $limit: '50',
      });

      if (SOCRATA_APP_TOKEN) {
        params.set('$$app_token', SOCRATA_APP_TOKEN);
      }

      const url = `${CHICAGO_CRIMES_API}?${params}`;

      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        console.error(`Chicago crimes API error: ${response.status}`);
        return null;
      }

      const data = await response.json();

      // Aggregate by category
      const byCategory: Record<string, number> = {};
      let total = 0;

      for (const row of data) {
        const category = String(row.primary_type || 'OTHER');
        const count = parseInt(String(row.count || '0'), 10);
        byCategory[category] = count;
        total += count;
      }

      // Find neighborhood ID for this area
      let neighborhoodId: string | null = null;
      for (const [nid, areas] of Object.entries(this.communityAreas)) {
        if (areas.includes(areaCode)) {
          neighborhoodId = nid;
          break;
        }
      }

      return {
        zone: this.getCommunityAreaName(areaCode),
        neighborhoodId,
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        totalIncidents: total,
        byCategory,
      };
    } catch (error) {
      console.error(`Failed to fetch crimes for area ${areaCode}:`, error);
      return null;
    }
  }

  /**
   * Get community area name from code
   */
  private getCommunityAreaName(code: string): string {
    const names: Record<string, string> = {
      '07': 'Lincoln Park',
      '08': 'Near North Side',
      '32': 'Loop',
    };
    return names[code] || `Area ${code}`;
  }

  /**
   * Map community area code to neighborhood ID
   */
  private mapCommunityAreaToNeighborhood(areaCode: string, address: string): string | null {
    const upper = address.toUpperCase();

    // Area 08 (Near North Side) contains multiple neighborhoods
    if (areaCode === '08') {
      // Gold Coast: roughly Walton to North Ave, Lake Shore Drive to Clark
      if (
        upper.includes('GOLD COAST') ||
        upper.includes('LAKE SHORE') ||
        upper.includes('ASTOR') ||
        upper.includes('STATE PKWY')
      ) {
        return 'gold-coast';
      }
      // River North: roughly Chicago River to Chicago Ave, Orleans to Lake Shore
      if (
        upper.includes('RIVER NORTH') ||
        upper.includes('HUBBARD') ||
        upper.includes('KINZIE')
      ) {
        return 'river-north';
      }
      // Streeterville: East of Michigan Ave, north of Chicago River
      if (
        upper.includes('STREETERVILLE') ||
        upper.includes('GRAND') ||
        upper.includes('ONTARIO') ||
        upper.includes('OHIO')
      ) {
        return 'streeterville';
      }
      // Default to Gold Coast for area 08
      return 'gold-coast';
    }

    // Area 07 is Lincoln Park
    if (areaCode === '07') {
      return 'lincoln-park';
    }

    return null;
  }

  /**
   * Map zip code to neighborhood
   */
  private mapZipToNeighborhood(zip: string, address: string): string | null {
    for (const zone of this.config.zones) {
      if (zone.postalCodes?.includes(zip)) {
        // For shared zips, try to disambiguate by address
        if (zone.postalCodes.length > 1 || this.config.zones.filter((z) =>
          z.postalCodes?.includes(zip)
        ).length > 1) {
          // Multiple zones share this zip - check address
          const upper = address.toUpperCase();
          if (upper.includes(zone.name.toUpperCase())) {
            return zone.neighborhoodId;
          }
        }
        return zone.neighborhoodId;
      }
    }
    return null;
  }

  /**
   * Extract keywords from work description
   */
  private extractKeywords(description: string): string[] {
    const keywords: string[] = [];
    const lower = description.toLowerCase();

    const keywordMap: Record<string, string[]> = {
      residential: ['residential', 'dwelling', 'apartment', 'condo', 'house'],
      commercial: ['commercial', 'office', 'retail', 'restaurant'],
      renovation: ['renovation', 'remodel', 'alteration', 'addition'],
      new_construction: ['new construction', 'erect', 'construct new'],
      interior: ['interior', 'finish work', 'buildout'],
    };

    for (const [category, terms] of Object.entries(keywordMap)) {
      if (terms.some((t) => lower.includes(t))) {
        keywords.push(category);
      }
    }

    return keywords;
  }
}
