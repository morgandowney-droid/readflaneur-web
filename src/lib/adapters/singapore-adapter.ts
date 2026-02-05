/**
 * Singapore Adapter
 *
 * The Expat Hub - Asia's premier wealth destination.
 *
 * Data sources:
 * - Permits: URA (Urban Redevelopment Authority)
 * - Liquor: SPF (Singapore Police Force)
 * - Safety: SPF Crime Statistics
 *
 * SPECIAL FEATURES:
 * 1. "Motor Watch" - COE (Certificate of Entitlement) monitoring
 *    Singapore's car license auction system
 *    Trigger: Cat B (Luxury Cars >1600cc) price drops > $5k
 *    Source: LTA (Land Transport Authority)
 *
 * 2. "GCB Alert" - Good Class Bungalow transactions
 *    Singapore's most exclusive residential properties
 *    Trigger: Detached house > $20M SGD
 *    Source: URA Private Residential Transactions
 *
 * Coverage zones: Nassim/Tanglin (D10), Sentosa Cove
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
  'nassim road',
  'cluny road',
  'ridout road',
  'dalvey road',
  'white house park',
  'holland road',
  'tanglin road',
  'orange grove',
  'lady hill',
  'leedon',
  'ocean drive',
  'treasure island',
  'cove grove',
  'paradise island',
];

// GCB (Good Class Bungalow) areas - 39 gazetted zones
const GCB_AREAS = [
  'nassim',
  'cluny',
  'ridout',
  'dalvey',
  'white house',
  'holland',
  'tanglin',
  'leedon',
  'caldecott',
  'chatsworth',
  'bin tong',
  'queen astrid',
  'chee hoon',
];

/**
 * COE Bidding result
 */
export interface COEResult {
  category: 'A' | 'B' | 'C' | 'D' | 'E';
  description: string;
  premium: number; // SGD
  previousPremium: number;
  change: number;
  biddingDate: string;
}

/**
 * GCB Transaction
 */
export interface GCBTransaction {
  address: string;
  area: string;
  price: number; // SGD
  pricePerSqFt: number;
  landSize: number; // sq ft
  tenure: 'Freehold' | 'Leasehold';
  transactionDate: string;
  isNewRecord: boolean;
}

/**
 * Singapore adapter for SG civic data
 */
export class SingaporeAdapter extends BaseCityAdapter {
  readonly city = 'Singapore';
  readonly country = 'Singapore';
  readonly currency = 'SGD';
  readonly vocabulary: CityVocabulary;

  constructor() {
    super(GLOBAL_CITY_CONFIG['Singapore']);
    this.vocabulary = CITY_VOCABULARIES['Singapore'];
  }

  /**
   * Check if address is on a premium street
   */
  private isPremiumStreet(address: string): boolean {
    const lower = address.toLowerCase();
    return PREMIUM_STREETS.some((street) => lower.includes(street));
  }

  /**
   * Check if address is in a GCB area
   */
  private isGCBArea(address: string): boolean {
    const lower = address.toLowerCase();
    return GCB_AREAS.some((area) => lower.includes(area));
  }

  /**
   * Fetch URA planning permissions
   */
  async getPermits(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const permits: StoryData[] = [];

    try {
      const uraData = await this.fetchURAPermits(sinceDate);
      permits.push(...uraData);

      return permits.filter((p) => {
        const text = `${p.title} ${p.description} ${p.address}`;

        // GCB areas always included
        if (this.isGCBArea(p.address)) return true;

        // Premium streets
        if (this.isPremiumStreet(p.address)) return true;

        // High value (S$5M+)
        if (p.value && p.value >= 5000000) return true;

        return this.hasLuxuryKeywords(text);
      });
    } catch (error) {
      console.error('Singapore permits fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch URA planning permissions
   */
  private async fetchURAPermits(since: Date): Promise<StoryData[]> {
    console.log(`Would fetch URA permits since ${since.toISOString()}`);
    // URA API: https://www.ura.gov.sg/Corporate/
    return [];
  }

  /**
   * Fetch liquor/entertainment licenses from SPF
   */
  async getLiquor(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    console.log(`Would fetch SPF licenses since ${sinceDate.toISOString()}`);
    return [];
  }

  /**
   * Fetch crime statistics from SPF
   */
  async getSafety(period: 'week' | 'month' = 'month'): Promise<SafetyStats[]> {
    const stats: SafetyStats[] = [];

    for (const zone of this.config.zones) {
      console.log(`Would fetch SPF data for ${zone.name}`);
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
  // SPECIAL FEATURE: "Motor Watch" - COE Monitoring
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get latest COE bidding results
   * Categories:
   * - Cat A: Cars ≤1600cc & ≤130bhp
   * - Cat B: Cars >1600cc or >130bhp (LUXURY CARS - our focus)
   * - Cat C: Goods vehicles & buses
   * - Cat D: Motorcycles
   * - Cat E: Open (any vehicle)
   */
  async getCOEResults(): Promise<COEResult[]> {
    try {
      // LTA COE bidding results
      // API: https://www.lta.gov.sg/content/ltagov/en/industry_innovations/industry_matters/coe.html
      console.log('Would fetch LTA COE results');

      // Placeholder - in production, fetch real data
      return [];
    } catch (error) {
      console.error('COE results fetch error:', error);
      return [];
    }
  }

  /**
   * Generate Motor Watch story if Cat B drops significantly
   * Trigger: Cat B drops > $5,000 SGD
   */
  async generateMotorWatchStory(): Promise<string | null> {
    const results = await this.getCOEResults();
    const catB = results.find((r) => r.category === 'B');

    if (!catB || catB.change >= -5000) return null;

    const dropAmount = Math.abs(catB.change).toLocaleString();
    const premium = catB.premium.toLocaleString();

    return `Motor Watch: COE premiums drop to S$${premium}. Cat B (luxury cars) down S$${dropAmount}. Time to register the Porsche?`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SPECIAL FEATURE: "GCB Alert" - Good Class Bungalow Transactions
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get recent GCB transactions from URA
   * Filter: Detached houses > $20M SGD in GCB areas
   */
  async getGCBTransactions(since?: Date): Promise<GCBTransaction[]> {
    const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    try {
      // URA Private Residential Property Transactions
      // API: https://www.ura.gov.sg/realEstateIIWeb/
      console.log(`Would fetch URA transactions since ${sinceDate.toISOString()}`);

      // Filter for:
      // - Property Type: Detached House
      // - Location: D10, D11, D21 (GCB areas)
      // - Price: > $20M SGD

      // Placeholder - in production, fetch real data
      return [];
    } catch (error) {
      console.error('GCB transactions fetch error:', error);
      return [];
    }
  }

  /**
   * Generate GCB Alert story for notable transactions
   */
  async generateGCBAlertStory(transaction: GCBTransaction): Promise<string> {
    const priceStr = (transaction.price / 1000000).toFixed(1);
    const psfStr = transaction.pricePerSqFt.toLocaleString();

    let headline = `GCB Alert: A S$${priceStr}M bungalow just transacted on ${transaction.address}.`;

    if (transaction.isNewRecord) {
      headline = `GCB Record: New high of S$${priceStr}M on ${transaction.address} (S$${psfStr} psf).`;
    }

    return headline;
  }

  /**
   * Map Singapore address to neighborhood
   */
  mapToNeighborhood(location: string, zoneCode?: string): string | null {
    const upper = location.toUpperCase();

    // Nassim / Tanglin (D10)
    if (
      upper.includes('NASSIM') ||
      upper.includes('TANGLIN') ||
      upper.includes('CLUNY') ||
      upper.includes('RIDOUT') ||
      upper.includes('DALVEY') ||
      upper.includes('HOLLAND') ||
      upper.includes('LEEDON') ||
      upper.includes('ORANGE GROVE') ||
      upper.includes('LADY HILL') ||
      upper.includes('WHITE HOUSE PARK') ||
      upper.includes('D10') ||
      upper.includes('DISTRICT 10')
    ) {
      return 'singapore-nassim';
    }

    // Sentosa Cove
    if (
      upper.includes('SENTOSA') ||
      upper.includes('OCEAN DRIVE') ||
      upper.includes('TREASURE ISLAND') ||
      upper.includes('COVE GROVE') ||
      upper.includes('PARADISE ISLAND') ||
      upper.includes('COVE WAY')
    ) {
      return 'singapore-sentosa';
    }

    return super.mapToNeighborhood(location, zoneCode);
  }
}
