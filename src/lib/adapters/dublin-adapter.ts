/**
 * Dublin City Adapter
 *
 * Fetches civic data from Irish data sources:
 * - Permits: Dublin City Council Planning Portal
 * - Liquor: Courts Service (Intoxicating Liquor Licences)
 * - Safety: Garda Síochána crime statistics
 *
 * Coverage zones: Ballsbridge (D4), Ranelagh (D6), Dalkey/Killiney
 *
 * Dublin D4/D6 society is small, chatty, and obsessed with property values.
 * Key streets: Shrewsbury Road, Ailesbury Road (most expensive in Ireland)
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

// Dublin City Council Planning Search
const DUBLIN_PLANNING_URL = 'https://www.dublincity.ie/residential/planning/planning-applications/view-planning-applications-decision';

// Premium street indicators (HERO story triggers)
const PREMIUM_STREETS = [
  'shrewsbury',
  'ailesbury',
  'merrion road',
  'wellington road',
  'anglesea road',
  'raglan road',
  'elgin road',
  'clyde road',
  'morehampton road',
  'eglinton road',
  'vico road',
  'coliemore',
  'sorrento',
  'killiney hill',
  'dalkey avenue',
];

// Protected structure keywords (heritage filter)
const HERITAGE_KEYWORDS = [
  'protected structure',
  'protected building',
  'conservation area',
  'georgian',
  'victorian',
  'listed building',
  'rps',
  'architectural conservation',
];

/**
 * Dublin adapter for Irish civic data
 */
export class DublinAdapter extends BaseCityAdapter {
  readonly city = 'Dublin';
  readonly country = 'Ireland';
  readonly currency = 'EUR';
  readonly vocabulary: CityVocabulary;

  // Dublin postcode to neighborhood mapping
  private readonly dublinCodes: Record<string, string[]> = {
    'dublin-ballsbridge': ['D04', 'Dublin 4', 'D4'],
    'dublin-ranelagh': ['D06', 'Dublin 6', 'D6'],
    'dublin-dalkey': ['A96', 'Dalkey', 'Killiney'],
  };

  constructor() {
    super(GLOBAL_CITY_CONFIG['Dublin']);
    this.vocabulary = CITY_VOCABULARIES['Dublin'];
  }

  /**
   * Check if address is on a premium street (triggers HERO story)
   */
  private isPremiumStreet(address: string): boolean {
    const lower = address.toLowerCase();
    return PREMIUM_STREETS.some((street) => lower.includes(street));
  }

  /**
   * Check if application involves protected structure
   */
  private isProtectedStructure(text: string): boolean {
    const lower = text.toLowerCase();
    return HERITAGE_KEYWORDS.some((kw) => lower.includes(kw));
  }

  /**
   * Fetch planning applications from Dublin City Council
   *
   * Filters for luxury indicators:
   * - Protected structures (Georgian/Victorian heritage)
   * - Premium addresses (Shrewsbury, Ailesbury, etc.)
   * - Extensions on large properties
   * - Change of use (often signifies development)
   */
  async getPermits(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const permits: StoryData[] = [];

    // Keywords that indicate significant development
    const luxuryKeywords = [
      'extension',
      'renovation',
      'refurbishment',
      'demolition',
      'new dwelling',
      'apartment',
      'basement',
      'swimming pool',
      'garage',
      'mews',
      'garden room',
      'annex',
    ];

    try {
      // Dublin City Council planning data
      const dublinData = await this.fetchDublinPlanning(sinceDate);
      permits.push(...dublinData);

      // Dún Laoghaire-Rathdown (covers Dalkey/Killiney)
      const dlrData = await this.fetchDLRPlanning(sinceDate);
      permits.push(...dlrData);

      // Filter for luxury/heritage indicators
      return permits.filter((p) => {
        const text = `${p.title} ${p.description} ${p.address}`.toLowerCase();

        // Always include protected structures
        if (this.isProtectedStructure(text)) return true;

        // Always include premium streets
        if (this.isPremiumStreet(p.address)) return true;

        // Include if has luxury keywords
        return luxuryKeywords.some((kw) => text.includes(kw));
      });
    } catch (error) {
      console.error('Dublin permits fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch Dublin City Council planning applications
   */
  private async fetchDublinPlanning(since: Date): Promise<StoryData[]> {
    console.log(`Would fetch Dublin City planning since ${since.toISOString()}`);

    // Dublin City Council uses APAS system
    // URL: http://www.dublincity.ie/swiftlg/apas/run/wphappcriteria.display
    // In production, this would scrape the planning portal or use their API

    // Placeholder: In production, implement actual scraping
    // The portal allows searching by:
    // - Date range
    // - Area (Dublin 4, Dublin 6, etc.)
    // - Application type
    // - Decision status

    return [];
  }

  /**
   * Fetch Dún Laoghaire-Rathdown planning applications (covers Dalkey/Killiney)
   */
  private async fetchDLRPlanning(since: Date): Promise<StoryData[]> {
    console.log(`Would fetch DLR planning since ${since.toISOString()}`);

    // DLR County Council planning portal
    // URL: https://planning.dlrcoco.ie/swiftlg/apas/run/wphappcriteria.display

    return [];
  }

  /**
   * Fetch intoxicating liquor licences from Courts Service
   *
   * Filters for:
   * - New pub/restaurant licences
   * - Special exemption orders (late night)
   * - Dance licence applications
   */
  async getLiquor(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const licenses: StoryData[] = [];

    try {
      // Irish liquor licences go through District Court
      // Applications published in local newspapers and court lists
      console.log(`Would fetch Dublin licensing since ${sinceDate.toISOString()}`);

      // In production, scrape:
      // - Courts Service court lists
      // - Local newspaper notices (Irish Times, Irish Independent)
      // - Gazette notices

      return licenses;
    } catch (error) {
      console.error('Dublin liquor fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch crime statistics from Garda Síochána / CSO
   *
   * Ireland uses Garda divisions for crime reporting
   * Relevant divisions: DMR South Central, DMR Eastern
   */
  async getSafety(period: 'week' | 'month' = 'month'): Promise<SafetyStats[]> {
    const stats: SafetyStats[] = [];

    try {
      for (const zone of this.config.zones) {
        const zoneStats = await this.fetchGardaData(zone.neighborhoodId, period);
        if (zoneStats) {
          stats.push(zoneStats);
        }
      }

      return stats;
    } catch (error) {
      console.error('Dublin safety fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch crime data from CSO (Central Statistics Office) or Garda API
   */
  private async fetchGardaData(
    neighborhoodId: string,
    period: 'week' | 'month'
  ): Promise<SafetyStats | null> {
    const zone = this.config.zones.find((z) => z.neighborhoodId === neighborhoodId);
    if (!zone) return null;

    // CSO provides quarterly crime statistics by Garda division
    // URL: https://data.cso.ie/
    // For real-time data, would need Garda press releases

    // Map neighborhoods to Garda sub-districts
    const gardaMapping: Record<string, string> = {
      'dublin-ballsbridge': 'Donnybrook',
      'dublin-ranelagh': 'Rathmines',
      'dublin-dalkey': 'Dun Laoghaire',
    };

    const gardaDistrict = gardaMapping[neighborhoodId];
    if (!gardaDistrict) return null;

    console.log(`Would fetch Garda data for ${gardaDistrict}`);

    // Calculate period
    const periodEnd = new Date();
    const periodStart = new Date();
    if (period === 'week') {
      periodStart.setDate(periodStart.getDate() - 7);
    } else {
      periodStart.setMonth(periodStart.getMonth() - 1);
    }

    // Placeholder return
    return {
      zone: zone.name,
      neighborhoodId,
      periodStart: periodStart.toISOString().split('T')[0],
      periodEnd: periodEnd.toISOString().split('T')[0],
      totalIncidents: 0,
      byCategory: {},
    };
  }

  /**
   * Map Dublin address to neighborhood
   */
  mapToNeighborhood(location: string, zoneCode?: string): string | null {
    const upper = location.toUpperCase();

    // Check Eircodes/Dublin postcodes first
    for (const [neighborhoodId, codes] of Object.entries(this.dublinCodes)) {
      for (const code of codes) {
        if (upper.includes(code.toUpperCase())) {
          return neighborhoodId;
        }
      }
    }

    // Check for specific area names
    // Ballsbridge (D4)
    if (
      upper.includes('BALLSBRIDGE') ||
      upper.includes('SHREWSBURY') ||
      upper.includes('AILESBURY') ||
      upper.includes('MERRION') ||
      upper.includes('PEMBROKE') ||
      upper.includes('HERBERT PARK') ||
      upper.includes('DONNYBROOK') ||
      upper.includes('SANDYMOUNT')
    ) {
      return 'dublin-ballsbridge';
    }

    // Ranelagh (D6)
    if (
      upper.includes('RANELAGH') ||
      upper.includes('DARTMOUTH') ||
      upper.includes('PALMERSTON') ||
      upper.includes('RATHMINES') ||
      upper.includes('MILLTOWN') ||
      upper.includes('BEECHWOOD')
    ) {
      return 'dublin-ranelagh';
    }

    // Dalkey/Killiney
    if (
      upper.includes('DALKEY') ||
      upper.includes('KILLINEY') ||
      upper.includes('VICO') ||
      upper.includes('COLIEMORE') ||
      upper.includes('SORRENTO') ||
      upper.includes('SANDYCOVE') ||
      upper.includes('GLASTHULE')
    ) {
      return 'dublin-dalkey';
    }

    // Use zone code as fallback
    if (zoneCode) {
      return super.mapToNeighborhood(location, zoneCode);
    }

    return null;
  }
}
