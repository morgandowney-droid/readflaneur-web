/**
 * Washington DC City Adapter
 *
 * Fetches civic data from DC Open Data:
 * - Permits: DC Building Permits
 * - Liquor: ABRA (Alcoholic Beverage Regulation Administration) licenses
 * - Safety: MPD (Metropolitan Police Department) crime data
 *
 * Data is filtered to Flâneur coverage zones (Georgetown, Dupont Circle, etc.)
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

// DC Open Data API endpoints
const DC_PERMITS_API = 'https://opendata.dc.gov/api/v3/datasets/building_permits/downloads/data';
const DC_CRIMES_API = 'https://opendata.dc.gov/api/v3/datasets/crime_incidents/downloads/data';

// Alternative: ArcGIS REST endpoints
const DC_PERMITS_ARCGIS = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Permit_Permits/MapServer/0/query';
const DC_CRIMES_ARCGIS = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/MPD/MapServer/8/query';

// ABRA License Search
const DC_ABRA_SEARCH = 'https://abra.dc.gov/page/license-look-up';

/**
 * Washington DC adapter for District civic data
 */
export class WashingtonDCAdapter extends BaseCityAdapter {
  readonly city = 'Washington DC';
  readonly country = 'USA';
  readonly currency = 'USD';
  readonly vocabulary: CityVocabulary;

  // ANC (Advisory Neighborhood Commission) codes
  private readonly ancCodes: Record<string, string[]> = {
    georgetown: ['2E'],
    'dupont-circle': ['2B'],
    kalorama: ['1C', '3C'],
    'capitol-hill': ['6A', '6B', '6C'],
  };

  // Ward mapping
  private readonly wardMap: Record<string, string[]> = {
    georgetown: ['2'],
    'dupont-circle': ['2'],
    kalorama: ['1', '3'],
    'capitol-hill': ['6'],
  };

  constructor() {
    super(GLOBAL_CITY_CONFIG['Washington DC']);
    this.vocabulary = CITY_VOCABULARIES['Washington DC'];
  }

  /**
   * Fetch building permits from DC Open Data
   *
   * Filters for:
   * - Permit value > $1,000,000
   * - Historic preservation projects (HPRB)
   * - Coverage zones (by ward/zip)
   */
  async getPermits(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    try {
      const permits = await this.fetchDCPermits(sinceDate);

      // Filter for luxury indicators
      return permits.filter((p) => {
        const meetsValue = p.value && p.value >= 1000000;
        const hasKeywords = this.hasLuxuryKeywords(`${p.title} ${p.description}`);
        const isHistoric = p.category?.toLowerCase().includes('historic');
        return meetsValue || hasKeywords || isHistoric;
      });
    } catch (error) {
      console.error('DC permits fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch permits from DC Open Data using ArcGIS REST API
   */
  private async fetchDCPermits(since: Date): Promise<StoryData[]> {
    const sinceStr = since.toISOString().split('T')[0];

    // Get zip codes for coverage zones
    const coverageZips = new Set<string>();
    for (const zone of this.config.zones) {
      zone.postalCodes?.forEach((z) => coverageZips.add(z));
    }

    try {
      // Build ArcGIS query
      const zipFilter = Array.from(coverageZips).map((z) => `'${z}'`).join(',');
      const whereClause = `ISSUE_DATE >= DATE '${sinceStr}' AND ZIP IN (${zipFilter})`;

      const params = new URLSearchParams({
        where: whereClause,
        outFields: '*',
        orderByFields: 'ISSUE_DATE DESC',
        resultRecordCount: '500',
        f: 'json',
      });

      const url = `${DC_PERMITS_ARCGIS}?${params}`;
      console.log(`Fetching DC permits: ${url.substring(0, 100)}...`);

      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        console.error(`DC permits API error: ${response.status}`);
        return [];
      }

      const data = await response.json();

      if (!data.features || !Array.isArray(data.features)) {
        console.log('No DC permit features returned');
        return [];
      }

      console.log(`Fetched ${data.features.length} DC permit records`);

      return data.features.map((feature: { attributes: Record<string, unknown> }) => {
        const attr = feature.attributes;
        const address = String(attr.FULL_ADDRESS || attr.ADDRESS || '');
        const zip = String(attr.ZIP || '').substring(0, 5);
        const ward = String(attr.WARD || '');
        const neighborhoodId = this.mapToNeighborhood(address, zip, ward);

        return {
          sourceId: String(attr.PERMIT_NUMBER || attr.OBJECTID || ''),
          dataType: 'permit' as const,
          address,
          zone: `Ward ${ward}`,
          neighborhoodId,
          date: this.parseArcGISDate(attr.ISSUE_DATE),
          title: String(attr.DESCRIPTION || attr.PERMIT_TYPE || 'Building Permit').substring(0, 100),
          description: String(attr.DESCRIPTION || ''),
          value: parseFloat(String(attr.FEE || attr.TOTAL_FEES || '0')),
          currency: 'USD',
          category: String(attr.PERMIT_TYPE || attr.PERMIT_CATEGORY || ''),
          keywords: this.extractDCKeywords(String(attr.DESCRIPTION || '')),
          rawData: attr,
        };
      }).filter((p: StoryData) => p.neighborhoodId !== null);
    } catch (error) {
      console.error('DC permits fetch error:', error);
      return [];
    }
  }

  /**
   * Parse ArcGIS date format (milliseconds since epoch)
   */
  private parseArcGISDate(dateValue: unknown): string {
    if (typeof dateValue === 'number') {
      return new Date(dateValue).toISOString().split('T')[0];
    }
    if (typeof dateValue === 'string') {
      return new Date(dateValue).toISOString().split('T')[0];
    }
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Fetch liquor licenses from DC ABRA
   *
   * ABRA publishes license applications and renewals
   */
  async getLiquor(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    try {
      // ABRA doesn't have a straightforward API
      // License data is available through their website and placard postings
      console.log(`Would fetch DC ABRA licenses since ${sinceDate.toISOString()}`);

      // Placeholder - would need scraping or FOIA request
      return [];
    } catch (error) {
      console.error('DC liquor fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch crime statistics from MPD data
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
      for (const zone of this.config.zones) {
        const zoneStats = await this.fetchMPDData(zone.neighborhoodId, periodStart, periodEnd);
        if (zoneStats) {
          stats.push(zoneStats);
        }
      }

      return stats;
    } catch (error) {
      console.error('DC safety fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch crime data from MPD using ArcGIS REST API
   */
  private async fetchMPDData(
    neighborhoodId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<SafetyStats | null> {
    const zone = this.config.zones.find((z) => z.neighborhoodId === neighborhoodId);
    if (!zone) return null;

    const wards = this.wardMap[neighborhoodId] || [];
    if (wards.length === 0) return null;

    const startStr = periodStart.toISOString().split('T')[0];

    try {
      // Build ward filter
      const wardFilter = wards.map((w) => `'${w}'`).join(',');
      const whereClause = `REPORT_DAT >= DATE '${startStr}' AND WARD IN (${wardFilter})`;

      const params = new URLSearchParams({
        where: whereClause,
        outFields: 'OFFENSE',
        returnCountOnly: 'false',
        returnGeometry: 'false',
        groupByFieldsForStatistics: 'OFFENSE',
        outStatistics: JSON.stringify([{
          statisticType: 'count',
          onStatisticField: 'OFFENSE',
          outStatisticFieldName: 'count'
        }]),
        f: 'json',
      });

      const url = `${DC_CRIMES_ARCGIS}?${params}`;

      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        console.error(`MPD API error: ${response.status}`);
        return null;
      }

      const data = await response.json();

      // Aggregate by category
      const byCategory: Record<string, number> = {};
      let total = 0;

      if (data.features && Array.isArray(data.features)) {
        for (const feature of data.features) {
          const category = String(feature.attributes?.OFFENSE || 'OTHER');
          const count = parseInt(String(feature.attributes?.count || '0'), 10);
          byCategory[category] = count;
          total += count;
        }
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
      console.error(`Failed to fetch MPD data for ${neighborhoodId}:`, error);
      return null;
    }
  }

  /**
   * Map DC address to neighborhood using zip/ward/address
   */
  mapToNeighborhood(address: string, zip?: string, ward?: string): string | null {
    const upper = address.toUpperCase();

    // Check zip codes first
    if (zip) {
      for (const zone of this.config.zones) {
        if (zone.postalCodes?.includes(zip)) {
          return zone.neighborhoodId;
        }
      }
    }

    // Check ward
    if (ward) {
      for (const [neighborhoodId, wards] of Object.entries(this.wardMap)) {
        if (wards.includes(ward)) {
          // Multiple neighborhoods in same ward - check address
          if (upper.includes('GEORGETOWN') || upper.includes('M ST NW') || upper.includes('WISCONSIN')) {
            return 'georgetown';
          }
          if (upper.includes('DUPONT') || upper.includes('CONNECTICUT')) {
            return 'dupont-circle';
          }
          if (upper.includes('KALORAMA') || upper.includes('EMBASSY')) {
            return 'kalorama';
          }
          if (upper.includes('CAPITOL') || upper.includes('EASTERN MARKET')) {
            return 'capitol-hill';
          }
          return neighborhoodId;
        }
      }
    }

    // Address-based matching
    if (upper.includes('GEORGETOWN')) return 'georgetown';
    if (upper.includes('DUPONT')) return 'dupont-circle';
    if (upper.includes('KALORAMA')) return 'kalorama';
    if (upper.includes('CAPITOL HILL') || upper.includes('SE NE') || upper.includes('EASTERN MARKET')) {
      return 'capitol-hill';
    }

    return null;
  }

  /**
   * Extract DC-specific keywords
   */
  private extractDCKeywords(description: string): string[] {
    const keywords: string[] = [];
    const lower = description.toLowerCase();

    const keywordMap: Record<string, string[]> = {
      historic: ['historic', 'hprb', 'preservation', 'landmark'],
      residential: ['residential', 'dwelling', 'row house', 'townhouse'],
      commercial: ['commercial', 'office', 'retail'],
      renovation: ['renovation', 'alteration', 'addition', 'restoration'],
    };

    for (const [category, terms] of Object.entries(keywordMap)) {
      if (terms.some((t) => lower.includes(t))) {
        keywords.push(category);
      }
    }

    return keywords;
  }

  /**
   * DC-specific luxury keywords
   */
  protected hasLuxuryKeywords(text: string): boolean {
    const dcKeywords = [
      'embassy',
      'mansion',
      'historic',
      'federal style',
      'georgetown colonial',
      'row house',
      'carriage house',
      'english basement',
      'garden level',
      'rooftop deck',
      'hprb',
      'preservation',
    ];

    const lower = text.toLowerCase();
    return dcKeywords.some((kw) => lower.includes(kw)) || super.hasLuxuryKeywords(text);
  }
}
