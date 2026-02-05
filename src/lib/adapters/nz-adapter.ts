/**
 * New Zealand Adapter
 *
 * Tier 1 market for ultra-wealthy survivalists (Thiel, Page, Cameron).
 * Monitors Auckland (The City) and Queenstown (The Retreat/Bunker).
 *
 * Data sources:
 * - Permits: Auckland Council + QLDC Resource/Building Consents
 * - Liquor: District Licensing Committees
 * - Safety: NZ Police Statistics
 * - OIO: Overseas Investment Office Decisions (Bunker Watch)
 *
 * Coverage zones:
 * Auckland: Herne Bay, Remuera, Waiheke Island
 * Queenstown: Dalefield/Millbrook, Kelvin Heights
 */

import {
  BaseCityAdapter,
  StoryData,
  SafetyStats,
  CityVocabulary,
  CityConfig,
} from './types';
import {
  GLOBAL_CITY_CONFIG,
  CITY_VOCABULARIES,
} from '@/config/global-locations';

// Premium street indicators for Auckland
const AUCKLAND_PREMIUM_STREETS = [
  'marine parade',
  'sentinel road',
  'sarsfield street',
  'arney road',
  'victoria avenue',
  'seaview road',
  'paritai drive',
  'lucerne road',
  'st stephens avenue',
  'brighton road',
  'oneroa',
  'palm beach',
  'church bay',
];

// Premium street indicators for Queenstown
const QUEENSTOWN_PREMIUM_STREETS = [
  'malaghans road',
  'speargrass flat',
  'millbrook',
  'peninsula road',
  'jardines',
  'lake hayes',
  'arrowtown',
  'closeburn',
  'wyuna',
];

// Keywords for high-value permits
const LUXURY_KEYWORDS = [
  'lifestyle',
  'vineyard',
  'waterfront',
  'lakefront',
  'north-facing',
  'harbour views',
  'pool',
  'helicopter',
  'helipad',
  'compound',
  'estate',
  'lodge',
  'retreat',
  'cellar',
  'bunker',
  'safe room',
  'security',
  'guest house',
  'tennis',
];

/**
 * OIO (Overseas Investment Office) Decision data
 * The ultimate signal of global titans moving in
 */
export interface OIODecision {
  decisionDate: string;
  applicant: string;
  assetDescription: string;
  location: string;
  region: string;
  hectares?: number;
  assetValue?: number;
  currency: 'NZD';
  outcome: 'Approved' | 'Declined' | 'Withdrawn';
  sensitiveType: string;
  url?: string;
}

/**
 * New Zealand adapter for Auckland and Queenstown
 */
export class NewZealandAdapter extends BaseCityAdapter {
  readonly city: string;
  readonly country = 'New Zealand';
  readonly currency = 'NZD';
  readonly vocabulary: CityVocabulary;

  private readonly region: 'Auckland' | 'Queenstown';

  constructor(config: CityConfig) {
    super(config);
    this.city = config.city;
    this.region = config.city as 'Auckland' | 'Queenstown';
    this.vocabulary = CITY_VOCABULARIES['New Zealand'];
  }

  /**
   * Check if address is on a premium street
   */
  private isPremiumStreet(address: string): boolean {
    const lower = address.toLowerCase();
    const streets =
      this.region === 'Auckland'
        ? AUCKLAND_PREMIUM_STREETS
        : QUEENSTOWN_PREMIUM_STREETS;
    return streets.some((street) => lower.includes(street));
  }

  /**
   * Check if description contains luxury indicators
   */
  private hasLuxuryIndicators(text: string): boolean {
    const lower = text.toLowerCase();
    return LUXURY_KEYWORDS.some((kw) => lower.includes(kw));
  }

  /**
   * Fetch resource/building consents
   *
   * Filters for:
   * - High-value consents ($1M+ NZD)
   * - Premium addresses
   * - Luxury keywords (lifestyle, vineyard, etc.)
   */
  async getPermits(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const permits: StoryData[] = [];

    try {
      if (this.region === 'Auckland') {
        const aucklandData = await this.fetchAucklandConsents(sinceDate);
        permits.push(...aucklandData);
      } else {
        const qldcData = await this.fetchQLDCConsents(sinceDate);
        permits.push(...qldcData);
      }

      // Filter for luxury indicators
      return permits.filter((p) => {
        const text = `${p.title} ${p.description} ${p.address}`.toLowerCase();

        // Always include premium streets
        if (this.isPremiumStreet(p.address)) return true;

        // Include high-value permits
        if (p.value && p.value >= 2000000) return true;

        // Include if has luxury keywords
        return this.hasLuxuryIndicators(text);
      });
    } catch (error) {
      console.error(`${this.region} permits fetch error:`, error);
      return [];
    }
  }

  /**
   * Fetch Auckland Council building/resource consents
   */
  private async fetchAucklandConsents(since: Date): Promise<StoryData[]> {
    console.log(`Would fetch Auckland Council consents since ${since.toISOString()}`);

    // Auckland Council uses a GIS-based consent tracking system
    // In production, this would use their API or scrape the consent register
    // URL: https://www.aucklandcouncil.govt.nz/building-and-consents/

    return [];
  }

  /**
   * Fetch QLDC (Queenstown Lakes District Council) consents
   */
  private async fetchQLDCConsents(since: Date): Promise<StoryData[]> {
    console.log(`Would fetch QLDC consents since ${since.toISOString()}`);

    // QLDC publishes weekly consent lists
    // URL: https://www.qldc.govt.nz/services/building-and-resource-consents/

    return [];
  }

  /**
   * Fetch liquor licenses from District Licensing Committee
   */
  async getLiquor(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const licenses: StoryData[] = [];

    try {
      console.log(`Would fetch ${this.region} liquor licenses since ${sinceDate.toISOString()}`);

      // NZ liquor licensing goes through District Licensing Committees
      // Each council publishes applications in local newspapers and online

      return licenses;
    } catch (error) {
      console.error(`${this.region} liquor fetch error:`, error);
      return [];
    }
  }

  /**
   * Fetch crime statistics from NZ Police
   */
  async getSafety(period: 'week' | 'month' = 'month'): Promise<SafetyStats[]> {
    const stats: SafetyStats[] = [];

    try {
      for (const zone of this.config.zones) {
        const zoneStats = await this.fetchNZPoliceData(zone.neighborhoodId, period);
        if (zoneStats) {
          stats.push(zoneStats);
        }
      }

      return stats;
    } catch (error) {
      console.error(`${this.region} safety fetch error:`, error);
      return [];
    }
  }

  /**
   * Fetch crime data from NZ Police statistics
   */
  private async fetchNZPoliceData(
    neighborhoodId: string,
    period: 'week' | 'month'
  ): Promise<SafetyStats | null> {
    const zone = this.config.zones.find((z) => z.neighborhoodId === neighborhoodId);
    if (!zone) return null;

    // NZ Police publishes crime statistics by police area
    // URL: https://www.police.govt.nz/about-us/statistics-and-publications/

    console.log(`Would fetch NZ Police data for ${zone.name}`);

    const periodEnd = new Date();
    const periodStart = new Date();
    if (period === 'week') {
      periodStart.setDate(periodStart.getDate() - 7);
    } else {
      periodStart.setMonth(periodStart.getMonth() - 1);
    }

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
   * ─────────────────────────────────────────────────────────────────────────────
   * OIO SERVICE: "BUNKER WATCH"
   * ─────────────────────────────────────────────────────────────────────────────
   *
   * Overseas Investment Office (OIO) Decision Monitoring
   * The ultimate signal of a global titan moving in.
   *
   * Source: LINZ (Land Information NZ) Decision Summaries
   * URL: https://www.linz.govt.nz/our-work/overseas-investment-regulation/decisions
   *
   * Filters:
   * - Asset Value > $10M NZD
   * - Applicant: Trusts or LLCs (often hiding names)
   * - Location: Auckland, Queenstown, Wanaka
   */
  async getOIODecisions(since?: Date): Promise<OIODecision[]> {
    const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const decisions: OIODecision[] = [];

    try {
      console.log(`Fetching OIO decisions since ${sinceDate.toISOString()}`);

      // In production, this would scrape the LINZ Decision Summaries table
      // URL: https://www.linz.govt.nz/our-work/overseas-investment-regulation/decisions
      //
      // The table contains:
      // - Decision Date
      // - Applicant Name
      // - Asset Description
      // - Location/Region
      // - Hectares
      // - Asset Value
      // - Outcome (Approved/Declined/Withdrawn)

      const rawDecisions = await this.fetchLINZDecisions(sinceDate);

      // Filter for our regions
      const relevantRegions = [
        'auckland',
        'queenstown',
        'wanaka',
        'wakatipu',
        'otago',
        'waiheke',
      ];

      for (const decision of rawDecisions) {
        const locationLower = decision.location.toLowerCase();

        // Check if location matches our regions
        const isRelevant = relevantRegions.some((r) => locationLower.includes(r));
        if (!isRelevant) continue;

        // Filter for high-value acquisitions ($10M+ NZD)
        if (decision.assetValue && decision.assetValue < 10000000) continue;

        // Only include approved decisions
        if (decision.outcome !== 'Approved') continue;

        decisions.push(decision);
      }

      console.log(`Found ${decisions.length} relevant OIO decisions`);
      return decisions;
    } catch (error) {
      console.error('OIO decisions fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch decisions from LINZ website
   */
  private async fetchLINZDecisions(since: Date): Promise<OIODecision[]> {
    // LINZ publishes monthly decision summaries as PDFs and HTML tables
    // URL: https://www.linz.govt.nz/our-work/overseas-investment-regulation/decisions
    //
    // In production, would:
    // 1. Fetch the decisions page
    // 2. Parse the table or download PDF
    // 3. Extract decision data
    // 4. Filter by date

    console.log(`Would fetch LINZ OIO decisions since ${since.toISOString()}`);

    // Placeholder return
    return [];
  }

  /**
   * Check if applicant appears to be a trust or LLC (hiding identity)
   */
  isObscuredApplicant(applicant: string): boolean {
    const patterns = [
      /trust/i,
      /llc/i,
      /limited/i,
      /ltd/i,
      /holdings/i,
      /investments/i,
      /properties/i,
      /nominees/i,
      /trustees/i,
      /partnership/i,
    ];
    return patterns.some((p) => p.test(applicant));
  }

  /**
   * Map NZ address to neighborhood
   */
  mapToNeighborhood(location: string, zoneCode?: string): string | null {
    const upper = location.toUpperCase();

    // Auckland neighborhoods
    if (
      upper.includes('HERNE BAY') ||
      upper.includes('ST MARYS BAY') ||
      upper.includes('ST MARY\'S BAY') ||
      upper.includes('MARINE PARADE') ||
      upper.includes('SENTINEL') ||
      upper.includes('PONSONBY')
    ) {
      return 'auckland-herne-bay';
    }

    if (
      upper.includes('REMUERA') ||
      upper.includes('ARNEY') ||
      upper.includes('VICTORIA AVENUE') ||
      upper.includes('SEAVIEW ROAD') ||
      upper.includes('ORAKEI') ||
      upper.includes('MISSION BAY')
    ) {
      return 'auckland-remuera';
    }

    if (
      upper.includes('WAIHEKE') ||
      upper.includes('ONEROA') ||
      upper.includes('PALM BEACH') ||
      upper.includes('CHURCH BAY') ||
      upper.includes('HAURAKI GULF')
    ) {
      return 'auckland-waiheke';
    }

    // Queenstown neighborhoods
    if (
      upper.includes('DALEFIELD') ||
      upper.includes('MILLBROOK') ||
      upper.includes('MALAGHANS') ||
      upper.includes('SPEARGRASS') ||
      upper.includes('ARROWTOWN')
    ) {
      return 'queenstown-dalefield';
    }

    if (
      upper.includes('KELVIN HEIGHTS') ||
      upper.includes('PENINSULA ROAD') ||
      upper.includes('JARDINE') ||
      upper.includes('FRANKTON ARM')
    ) {
      return 'queenstown-kelvin-heights';
    }

    // Generic Queenstown/Wakatipu
    if (
      upper.includes('QUEENSTOWN') ||
      upper.includes('WAKATIPU') ||
      upper.includes('LAKE HAYES')
    ) {
      // Default to Dalefield for generic Queenstown
      return 'queenstown-dalefield';
    }

    // Generic Auckland
    if (upper.includes('AUCKLAND')) {
      // Default to Herne Bay for generic Auckland
      return 'auckland-herne-bay';
    }

    // Use zone code as fallback
    if (zoneCode) {
      return super.mapToNeighborhood(location, zoneCode);
    }

    return null;
  }
}

/**
 * Create Auckland adapter instance
 */
export function createAucklandAdapter(): NewZealandAdapter {
  return new NewZealandAdapter(GLOBAL_CITY_CONFIG['Auckland']);
}

/**
 * Create Queenstown adapter instance
 */
export function createQueenstownAdapter(): NewZealandAdapter {
  return new NewZealandAdapter(GLOBAL_CITY_CONFIG['Queenstown']);
}
