/**
 * Vancouver City Adapter
 *
 * Pacific Money - Asian wealth meets West Coast lifestyle.
 *
 * Data sources:
 * - Permits: Vancouver Open Data (Development Permits)
 * - Liquor: BC LCLB
 * - Safety: VPD GeoDash
 *
 * SPECIAL FEATURE: "View Cones"
 * Vancouver has protected view corridors to the mountains and water.
 * Height variances in West Vancouver are major stories - neighbors fight fiercely.
 * Trigger: "View Cone", "Height Variance", "Relaxation" keywords.
 *
 * Coverage zones: West Vancouver (British Properties), Point Grey/Shaughnessy
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
  'chartwell',
  'canterbury',
  'whitby',
  'eyremount',
  'chippendale',
  'craigmohr',
  'belmont avenue',
  'the crescent',
  'marine drive',
  'point grey road',
  'sw marine',
  'drummond',
  'marguerite',
  'hosmer',
  'angus',
  'nanton',
  'pine crescent',
];

// View Cone keywords - trigger View Watch stories
const VIEW_CONE_KEYWORDS = [
  'view cone',
  'view corridor',
  'height variance',
  'height relaxation',
  'variance',
  'relaxation',
  'sight line',
];

/**
 * Vancouver adapter for BC civic data
 */
export class VancouverAdapter extends BaseCityAdapter {
  readonly city = 'Vancouver';
  readonly country = 'Canada';
  readonly currency = 'CAD';
  readonly vocabulary: CityVocabulary;

  constructor() {
    super(GLOBAL_CITY_CONFIG['Vancouver']);
    this.vocabulary = CITY_VOCABULARIES['Vancouver'];
  }

  /**
   * Check if address is on a premium street
   */
  private isPremiumStreet(address: string): boolean {
    const lower = address.toLowerCase();
    return PREMIUM_STREETS.some((street) => lower.includes(street));
  }

  /**
   * Check if permit involves View Cone (major story trigger)
   */
  private isViewConePermit(text: string): boolean {
    const lower = text.toLowerCase();
    return VIEW_CONE_KEYWORDS.some((kw) => lower.includes(kw));
  }

  /**
   * Fetch development permits
   *
   * SPECIAL: View Cone alerts for height variances
   */
  async getPermits(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const permits: StoryData[] = [];

    try {
      // Vancouver Open Data API
      const vancouverData = await this.fetchVancouverPermits(sinceDate);
      permits.push(...vancouverData);

      // West Vancouver (District of West Vancouver)
      const westVanData = await this.fetchWestVanPermits(sinceDate);
      permits.push(...westVanData);

      // Filter for luxury/notable permits
      return permits.filter((p) => {
        const text = `${p.title} ${p.description} ${p.address}`;

        // View Cone permits are always stories
        if (this.isViewConePermit(text)) return true;

        // Premium streets
        if (this.isPremiumStreet(p.address)) return true;

        // High value permits
        if (p.value && p.value >= 2000000) return true;

        // Luxury keywords
        return this.hasLuxuryKeywords(text);
      });
    } catch (error) {
      console.error('Vancouver permits fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch City of Vancouver development permits
   */
  private async fetchVancouverPermits(since: Date): Promise<StoryData[]> {
    console.log(`Would fetch Vancouver permits since ${since.toISOString()}`);
    // Vancouver Open Data: https://opendata.vancouver.ca/
    // Development permits dataset
    return [];
  }

  /**
   * Fetch District of West Vancouver permits
   */
  private async fetchWestVanPermits(since: Date): Promise<StoryData[]> {
    console.log(`Would fetch West Van permits since ${since.toISOString()}`);
    // West Vancouver building permits portal
    return [];
  }

  /**
   * Fetch liquor licenses from BC LCLB
   */
  async getLiquor(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    console.log(`Would fetch BC liquor licenses since ${sinceDate.toISOString()}`);
    return [];
  }

  /**
   * Fetch crime statistics from VPD
   */
  async getSafety(period: 'week' | 'month' = 'month'): Promise<SafetyStats[]> {
    const stats: SafetyStats[] = [];

    for (const zone of this.config.zones) {
      console.log(`Would fetch VPD data for ${zone.name}`);
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
   * Map Vancouver address to neighborhood
   */
  mapToNeighborhood(location: string, zoneCode?: string): string | null {
    const upper = location.toUpperCase();

    // West Vancouver / British Properties
    if (
      upper.includes('WEST VANCOUVER') ||
      upper.includes('WEST VAN') ||
      upper.includes('BRITISH PROPERTIES') ||
      upper.includes('CHARTWELL') ||
      upper.includes('CANTERBURY') ||
      upper.includes('WHITBY') ||
      upper.includes('EYREMOUNT') ||
      upper.includes('CHIPPENDALE')
    ) {
      return 'vancouver-west-vancouver';
    }

    // Point Grey / Shaughnessy
    if (
      upper.includes('POINT GREY') ||
      upper.includes('SHAUGHNESSY') ||
      upper.includes('BELMONT') ||
      upper.includes('THE CRESCENT') ||
      upper.includes('SW MARINE') ||
      upper.includes('UBC') ||
      upper.includes('DUNBAR') ||
      upper.includes('KERRISDALE')
    ) {
      return 'vancouver-point-grey';
    }

    return super.mapToNeighborhood(location, zoneCode);
  }
}
