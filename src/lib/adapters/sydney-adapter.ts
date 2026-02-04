/**
 * Sydney City Adapter
 *
 * Fetches civic data from NSW/Australian data sources:
 * - Permits: NSW Planning Portal (Development Applications)
 * - Liquor: Liquor & Gaming NSW Application Noticeboard
 * - Safety: BOCSAR (Bureau of Crime Statistics and Research)
 *
 * Data is filtered to Flâneur coverage zones (Double Bay, Woollahra, Mosman, etc.)
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

// NSW Planning Portal API
const NSW_PLANNING_API = 'https://api.apps1.nsw.gov.au/eplanning/data/v0';

// Liquor & Gaming NSW
const LIQUOR_NSW = 'https://www.liquorandgaming.nsw.gov.au';

/**
 * Sydney adapter for Australian civic data
 */
export class SydneyAdapter extends BaseCityAdapter {
  readonly city = 'Sydney';
  readonly country = 'Australia';
  readonly currency = 'AUD';
  readonly vocabulary: CityVocabulary;

  // LGA codes for our coverage zones
  private readonly lgaCodes: Record<string, string> = {
    Woollahra: '17700',
    Mosman: '15350',
    'City of Sydney': '17200',
    'North Sydney': '15500',
  };

  constructor() {
    super(GLOBAL_CITY_CONFIG['Sydney']);
    this.vocabulary = CITY_VOCABULARIES['Sydney'];
  }

  /**
   * Fetch Development Applications from NSW Planning Portal
   *
   * Filters for luxury indicators:
   * - DA value > $2M AUD
   * - Keywords: waterfront, pool, pavilion, heritage
   * - Trophy home suburbs
   */
  async getPermits(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const permits: StoryData[] = [];

    const luxuryKeywords = [
      'waterfront',
      'harbour',
      'harbor',
      'pool',
      'pavilion',
      'heritage',
      'sandstone',
      'federation',
      'trophy',
      'prestige',
      'alterations and additions',
      'new dwelling',
      'basement',
      'garage',
      'tennis court',
    ];

    try {
      // Fetch from each LGA in our coverage
      for (const [lgaName, lgaCode] of Object.entries(this.lgaCodes)) {
        const lgaPermits = await this.fetchNSWPlanningData(lgaCode, lgaName, sinceDate);
        permits.push(...lgaPermits);
      }

      // Filter for luxury indicators
      return permits.filter((p) => {
        const text = `${p.title} ${p.description}`.toLowerCase();
        const hasLuxuryKeyword = luxuryKeywords.some((kw) => text.includes(kw));
        const meetsValueThreshold = p.value && p.value >= 2000000;
        return hasLuxuryKeyword || meetsValueThreshold;
      });
    } catch (error) {
      console.error('Sydney permits fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch DAs from NSW Planning Portal for a specific LGA
   */
  private async fetchNSWPlanningData(
    lgaCode: string,
    lgaName: string,
    since: Date
  ): Promise<StoryData[]> {
    try {
      // NSW Planning Portal API endpoint for DAs
      // Note: Actual API may require authentication or different endpoint
      const sinceStr = since.toISOString().split('T')[0];

      const params = new URLSearchParams({
        LGA: lgaCode,
        lodgementDateFrom: sinceStr,
        PageSize: '100',
      });

      const url = `${NSW_PLANNING_API}/Applications?${params}`;
      console.log(`Fetching NSW Planning data for ${lgaName}: ${url}`);

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`NSW Planning API error: ${response.status}`);
        return [];
      }

      const data = await response.json();

      if (!data.Application || !Array.isArray(data.Application)) {
        return [];
      }

      return data.Application.map((app: Record<string, unknown>) => {
        const address = String(app.Location || app.Address || '');
        const description = String(app.ApplicationDescription || app.Description || '');

        return {
          sourceId: String(app.PlanningPortalApplicationNumber || app.ApplicationId || ''),
          dataType: 'permit' as const,
          address,
          zone: lgaName,
          neighborhoodId: this.mapToNeighborhood(address, lgaName),
          date: String(app.LodgementDate || ''),
          title: description.substring(0, 100),
          description,
          value: this.parseAUDValue(app.CostOfDevelopment || app.EstimatedCost),
          currency: 'AUD',
          category: String(app.ApplicationType || 'DA'),
          rawData: app,
        };
      });
    } catch (error) {
      console.error(`Failed to fetch NSW Planning for ${lgaName}:`, error);
      return [];
    }
  }

  /**
   * Parse Australian dollar value from various formats
   */
  private parseAUDValue(value: unknown): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const cleaned = value.replace(/[$,AUD\s]/gi, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  /**
   * Fetch liquor licenses from Liquor & Gaming NSW
   *
   * Monitors:
   * - New on-premises licenses
   * - Small bar licenses
   * - Restaurant licenses in premium areas
   */
  async getLiquor(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const licenses: StoryData[] = [];

    try {
      // Liquor & Gaming NSW publishes applications on their noticeboard
      // This typically requires scraping as there's no public API
      console.log(`Would fetch NSW liquor licenses since ${sinceDate.toISOString()}`);

      // The noticeboard URL pattern:
      // https://www.liquorandgaming.nsw.gov.au/operating-a-business/liquor-licences/liquor-licence-applications

      // Placeholder - would need web scraping implementation
      return licenses;
    } catch (error) {
      console.error('Sydney liquor fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch crime statistics from BOCSAR
   *
   * BOCSAR provides quarterly crime statistics by LGA
   * More granular data available via their data tools
   */
  async getSafety(period: 'week' | 'month' = 'month'): Promise<SafetyStats[]> {
    const stats: SafetyStats[] = [];

    try {
      // BOCSAR data is typically quarterly, accessed via their data tool
      // https://www.bocsar.nsw.gov.au/Pages/bocsar_crime_stats/bocsar_crime_stats.aspx

      for (const zone of this.config.zones) {
        const zoneStats = await this.fetchBOCSARData(zone.neighborhoodId, period);
        if (zoneStats) {
          stats.push(zoneStats);
        }
      }

      return stats;
    } catch (error) {
      console.error('Sydney safety fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch crime data from BOCSAR for a specific LGA
   */
  private async fetchBOCSARData(
    neighborhoodId: string,
    period: 'week' | 'month'
  ): Promise<SafetyStats | null> {
    const zone = this.config.zones.find((z) => z.neighborhoodId === neighborhoodId);
    if (!zone) return null;

    try {
      // BOCSAR doesn't have a public API - data is typically downloaded
      // or accessed through their interactive tools
      console.log(`Would fetch BOCSAR data for ${zone.name}`);

      // Calculate period
      const periodEnd = new Date();
      const periodStart = new Date();
      if (period === 'week') {
        periodStart.setDate(periodStart.getDate() - 7);
      } else {
        periodStart.setMonth(periodStart.getMonth() - 1);
      }

      // Placeholder response
      return {
        zone: zone.name,
        neighborhoodId,
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        totalIncidents: 0,
        byCategory: {},
      };
    } catch (error) {
      console.error(`Failed to fetch BOCSAR data for ${neighborhoodId}:`, error);
      return null;
    }
  }

  /**
   * Map Sydney address to neighborhood
   */
  mapToNeighborhood(location: string, lga?: string): string | null {
    const upper = location.toUpperCase();

    // Check postal codes first
    for (const zone of this.config.zones) {
      if (zone.postalCodes) {
        for (const postal of zone.postalCodes) {
          if (upper.includes(postal)) {
            return zone.neighborhoodId;
          }
        }
      }
    }

    // Check suburb names
    if (upper.includes('DOUBLE BAY')) {
      return 'double-bay';
    }
    if (upper.includes('WOOLLAHRA') && !upper.includes('DOUBLE BAY')) {
      return 'woollahra';
    }
    if (upper.includes('MOSMAN')) {
      return 'mosman';
    }
    if (upper.includes('PADDINGTON')) {
      return 'paddington-sydney';
    }

    // Use LGA as fallback
    if (lga) {
      return super.mapToNeighborhood(location, lga);
    }

    return null;
  }
}
