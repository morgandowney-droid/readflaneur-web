/**
 * Cape Town City Adapter
 *
 * The Winter Escape - South Africa's premier luxury destination.
 *
 * Data sources:
 * - Permits: City of Cape Town Building Plans
 * - Liquor: Western Cape Liquor Authority
 * - Safety: SAPS Crime Statistics
 *
 * SPECIAL FEATURES:
 * 1. "Beach Alert" - Cape Doctor wind monitoring
 *    When wind < 15km/h on weekends = RARE perfect beach day
 *    Source: Windguru / OpenWeatherMap
 *
 * 2. "Grid Watch" - Load Shedding alerts
 *    Eskom rolling blackouts affect daily life
 *    Source: City of Cape Town Power Alerts
 *
 * Coverage zones: Clifton/Camps Bay (Atlantic Seaboard), Constantia (Wine Estates)
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
  'nettleton road',
  'victoria road',
  'kloof road',
  'fishermans bend',
  'beta road',
  'geneva drive',
  'southern cross drive',
  'silverhurst',
  'high constantia',
  'constantia main',
  'brommersvlei',
  'alphen',
];

/**
 * Load shedding stage levels
 */
export interface LoadSheddingStage {
  stage: number; // 0-8 (0 = no load shedding)
  startTime: string;
  endTime: string;
  area: string;
}

/**
 * Wind/Weather conditions for Beach Alert
 */
export interface BeachConditions {
  windSpeed: number; // km/h
  windDirection: string;
  temperature: number;
  isWeekend: boolean;
  isPerfectDay: boolean; // Wind < 15km/h on weekend
}

/**
 * Cape Town adapter for South African civic data
 */
export class CapeTownAdapter extends BaseCityAdapter {
  readonly city = 'Cape Town';
  readonly country = 'South Africa';
  readonly currency = 'ZAR';
  readonly vocabulary: CityVocabulary;

  constructor() {
    super(GLOBAL_CITY_CONFIG['Cape Town']);
    this.vocabulary = CITY_VOCABULARIES['Cape Town'];
  }

  /**
   * Check if address is on a premium street
   */
  private isPremiumStreet(address: string): boolean {
    const lower = address.toLowerCase();
    return PREMIUM_STREETS.some((street) => lower.includes(street));
  }

  /**
   * Fetch building plans/development applications
   */
  async getPermits(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const permits: StoryData[] = [];

    try {
      const cctData = await this.fetchCCTPermits(sinceDate);
      permits.push(...cctData);

      return permits.filter((p) => {
        const text = `${p.title} ${p.description} ${p.address}`;

        // Premium streets always included
        if (this.isPremiumStreet(p.address)) return true;

        // High value permits (R20M+ ~ $1M USD)
        if (p.value && p.value >= 20000000) return true;

        // Wine estate keywords
        if (text.toLowerCase().includes('wine') ||
            text.toLowerCase().includes('estate') ||
            text.toLowerCase().includes('vineyard')) return true;

        return this.hasLuxuryKeywords(text);
      });
    } catch (error) {
      console.error('Cape Town permits fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch City of Cape Town building plans
   */
  private async fetchCCTPermits(since: Date): Promise<StoryData[]> {
    console.log(`Would fetch CCT permits since ${since.toISOString()}`);
    // City of Cape Town City Connect portal
    return [];
  }

  /**
   * Fetch liquor licenses from WCLAC
   */
  async getLiquor(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    console.log(`Would fetch WCLAC licenses since ${sinceDate.toISOString()}`);
    return [];
  }

  /**
   * Fetch crime statistics from SAPS
   */
  async getSafety(period: 'week' | 'month' = 'month'): Promise<SafetyStats[]> {
    const stats: SafetyStats[] = [];

    for (const zone of this.config.zones) {
      console.log(`Would fetch SAPS data for ${zone.name}`);
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

  // ─────────────────────────────────────────────────────────────────────────────
  // SPECIAL FEATURE: "Beach Alert" - Wind Monitoring
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Check current wind conditions for Beach Alert
   * Cape Doctor (south-easter) typically blows 30-50+ km/h
   * < 15 km/h on weekend = RARE perfect conditions
   */
  async getBeachConditions(): Promise<BeachConditions | null> {
    try {
      // Would fetch from OpenWeatherMap or Windguru
      // API: https://openweathermap.org/api
      console.log('Would fetch Cape Town wind conditions');

      const now = new Date();
      const dayOfWeek = now.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      // Placeholder - in production, fetch real data
      return {
        windSpeed: 25, // typical Cape Doctor day
        windDirection: 'SE',
        temperature: 28,
        isWeekend,
        isPerfectDay: false,
      };
    } catch (error) {
      console.error('Beach conditions fetch error:', error);
      return null;
    }
  }

  /**
   * Generate Beach Alert story if conditions are perfect
   */
  async generateBeachAlertStory(): Promise<string | null> {
    const conditions = await this.getBeachConditions();
    if (!conditions || !conditions.isPerfectDay) return null;

    return `Calm Alert: The Cape Doctor is out. ${conditions.windSpeed}km/h winds and ${conditions.temperature}°C. Perfect conditions for Clifton 4th.`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SPECIAL FEATURE: "Grid Watch" - Load Shedding Alerts
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get current load shedding schedule for our zones
   */
  async getLoadSheddingSchedule(): Promise<LoadSheddingStage[]> {
    try {
      // Would fetch from City of Cape Town or EskomSePush API
      // API: https://eskomsepush.gumroad.com/l/api
      console.log('Would fetch load shedding schedule');

      // Placeholder - in production, fetch real data
      return [];
    } catch (error) {
      console.error('Load shedding fetch error:', error);
      return [];
    }
  }

  /**
   * Generate Grid Watch story if load shedding is active
   */
  async generateGridWatchStory(): Promise<string | null> {
    const schedule = await this.getLoadSheddingSchedule();
    if (schedule.length === 0) return null;

    const activeStage = schedule[0];
    return `Grid Watch: Stage ${activeStage.stage} Load Shedding starts at ${activeStage.startTime}. Check generators.`;
  }

  /**
   * Map Cape Town address to neighborhood
   */
  mapToNeighborhood(location: string, zoneCode?: string): string | null {
    const upper = location.toUpperCase();

    // Atlantic Seaboard (Clifton, Camps Bay, Bantry Bay)
    if (
      upper.includes('CLIFTON') ||
      upper.includes('CAMPS BAY') ||
      upper.includes('BANTRY BAY') ||
      upper.includes('BAKOVEN') ||
      upper.includes('FRESNAYE') ||
      upper.includes('SEA POINT') ||
      upper.includes('ATLANTIC SEABOARD') ||
      upper.includes('NETTLETON') ||
      upper.includes('VICTORIA ROAD')
    ) {
      return 'capetown-atlantic-seaboard';
    }

    // Constantia
    if (
      upper.includes('CONSTANTIA') ||
      upper.includes('SILVERHURST') ||
      upper.includes('ALPHEN') ||
      upper.includes('GROOT CONSTANTIA') ||
      upper.includes('TOKAI') ||
      upper.includes('SOUTHERN CROSS')
    ) {
      return 'capetown-constantia';
    }

    return super.mapToNeighborhood(location, zoneCode);
  }
}
