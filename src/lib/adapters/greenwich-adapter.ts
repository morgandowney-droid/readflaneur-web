/**
 * Greenwich Adapter
 *
 * Hedge Fund Estates - NYC's Bedroom Community.
 *
 * Data sources:
 * - Permits: Town of Greenwich Building Division
 * - Liquor: CT DCP License Services
 * - Safety: Greenwich Police Department
 *
 * Greenwich Backcountry is where hedge fund managers retreat.
 * Multi-acre estates, stone walls, horse properties, and extreme privacy.
 * Round Hill Road, North Street, and Conyers Farm are the addresses.
 *
 * Coverage: Greenwich Backcountry
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

// Premium street indicators (HERO story triggers)
const PREMIUM_STREETS = [
  'round hill road',
  'north street',
  'conyers farm',
  'john street',
  'taconic road',
  'riversville road',
  'lake avenue',
  'stanwich road',
  'mid country',
  'clapboard ridge',
  'bedford road',
  'close road',
  'doubling road',
  'parsonage road',
];

// Luxury property keywords
const LUXURY_KEYWORDS = [
  'compound',
  'estate',
  'acreage',
  'horse',
  'equestrian',
  'tennis',
  'pool',
  'guest house',
  'carriage house',
  'caretaker',
  'barn',
  'paddock',
  'stone wall',
  'waterfront',
  'pond',
  'stream',
];

/**
 * Greenwich adapter for Connecticut civic data
 */
export class GreenwichAdapter extends BaseCityAdapter {
  readonly city = 'Greenwich';
  readonly country = 'USA';
  readonly currency = 'USD';
  readonly vocabulary: CityVocabulary;

  constructor() {
    super(GLOBAL_CITY_CONFIG['Greenwich']);
    this.vocabulary = CITY_VOCABULARIES['Greenwich'];
  }

  /**
   * Check if address is on a premium street
   */
  private isPremiumStreet(address: string): boolean {
    const lower = address.toLowerCase();
    return PREMIUM_STREETS.some((street) => lower.includes(street));
  }

  /**
   * Check if description indicates luxury property
   */
  private hasGreenwichLuxuryKeywords(text: string): boolean {
    const lower = text.toLowerCase();
    return LUXURY_KEYWORDS.some((kw) => lower.includes(kw));
  }

  /**
   * Fetch building permits
   */
  async getPermits(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const permits: StoryData[] = [];

    try {
      const greenwichData = await this.fetchGreenwichPermits(sinceDate);
      permits.push(...greenwichData);

      return permits.filter((p) => {
        const text = `${p.title} ${p.description} ${p.address}`;

        // Premium streets always included
        if (this.isPremiumStreet(p.address)) return true;

        // High value permits ($2M+)
        if (p.value && p.value >= 2000000) return true;

        // Greenwich-specific luxury keywords
        if (this.hasGreenwichLuxuryKeywords(text)) return true;

        // Generic luxury keywords
        return this.hasLuxuryKeywords(text);
      });
    } catch (error) {
      console.error('Greenwich permits fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch Town of Greenwich building permits
   */
  private async fetchGreenwichPermits(since: Date): Promise<StoryData[]> {
    console.log(`Would fetch Greenwich permits since ${since.toISOString()}`);
    // Town of Greenwich Building Division
    // URL: https://www.greenwichct.gov/216/Building-Division
    return [];
  }

  /**
   * Fetch liquor licenses from CT DCP
   */
  async getLiquor(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    console.log(`Would fetch CT DCP licenses since ${sinceDate.toISOString()}`);
    // Connecticut DCP License Services
    return [];
  }

  /**
   * Fetch crime statistics from Greenwich Police
   */
  async getSafety(period: 'week' | 'month' = 'month'): Promise<SafetyStats[]> {
    const stats: SafetyStats[] = [];

    for (const zone of this.config.zones) {
      console.log(`Would fetch GPD data for ${zone.name}`);
      const periodEnd = new Date();
      const periodStart = new Date();
      if (period === 'week') {
        periodStart.setDate(periodStart.getDate() - 7);
      } else {
        periodStart.setMonth(periodStart.getMonth() - 1);
      }

      stats.push({
        zone: zone.name,
        neighborhoodId: zone.neighborhoodId,
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        totalIncidents: 0,
        byCategory: {},
      });
    }

    return stats;
  }

  /**
   * Map Greenwich address to neighborhood
   */
  mapToNeighborhood(location: string, zoneCode?: string): string | null {
    const upper = location.toUpperCase();

    // Greenwich Backcountry
    if (
      upper.includes('GREENWICH') ||
      upper.includes('06831') ||
      upper.includes('ROUND HILL') ||
      upper.includes('NORTH STREET') ||
      upper.includes('CONYERS FARM') ||
      upper.includes('BACKCOUNTRY') ||
      upper.includes('MID-COUNTRY') ||
      upper.includes('MID COUNTRY') ||
      upper.includes('STANWICH') ||
      upper.includes('RIVERSVILLE')
    ) {
      return 'greenwich-backcountry';
    }

    return super.mapToNeighborhood(location, zoneCode);
  }
}
