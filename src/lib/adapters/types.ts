/**
 * City Adapter Types
 *
 * Standardized interface for fetching civic data from different cities worldwide.
 * Each city implements the ICityAdapter interface to normalize data from their
 * specific Open Data platforms.
 */

/**
 * Normalized story data from any civic data source
 */
export interface StoryData {
  /** Unique identifier from source system */
  sourceId: string;
  /** Type of civic data */
  dataType: 'permit' | 'liquor' | 'safety';
  /** Address or location description */
  address: string;
  /** Neighborhood/zone this belongs to */
  zone: string;
  /** Flâneur neighborhood ID (URL slug) */
  neighborhoodId: string | null;
  /** Date of filing/application/incident */
  date: string;
  /** Human-readable title/summary */
  title: string;
  /** Detailed description */
  description: string;
  /** Monetary value if applicable (in local currency) */
  value?: number;
  /** Currency code (USD, GBP, AUD, EUR) */
  currency?: string;
  /** Category/type from source system */
  category?: string;
  /** Keywords for filtering/matching */
  keywords?: string[];
  /** Raw data from source API */
  rawData: Record<string, unknown>;
}

/**
 * Safety/crime statistics aggregated by zone
 */
export interface SafetyStats {
  zone: string;
  neighborhoodId: string | null;
  periodStart: string;
  periodEnd: string;
  totalIncidents: number;
  byCategory: Record<string, number>;
  trend?: 'up' | 'down' | 'stable';
  trendPercentage?: number;
}

/**
 * City adapter interface - all city adapters must implement this
 */
export interface ICityAdapter {
  /** City name */
  readonly city: string;
  /** Country name */
  readonly country: string;
  /** Currency code */
  readonly currency: string;
  /** Cultural vocabulary for AI content generation */
  readonly vocabulary: CityVocabulary;

  /**
   * Fetch notable permit/planning applications
   * Filters: >$1M (or equivalent), luxury keywords
   */
  getPermits(since?: Date): Promise<StoryData[]>;

  /**
   * Fetch new liquor/premises licenses
   * Filters: New venues, luxury establishments
   */
  getLiquor(since?: Date): Promise<StoryData[]>;

  /**
   * Fetch safety/crime statistics
   * Returns weekly trend stats by zone
   */
  getSafety(period?: 'week' | 'month'): Promise<SafetyStats[]>;

  /**
   * Map a raw address/location to a Flâneur neighborhood ID
   */
  mapToNeighborhood(location: string, zone?: string): string | null;
}

/**
 * City-specific vocabulary for AI content generation
 */
export interface CityVocabulary {
  /** Terms for building permits/planning */
  permitTerms: string[];
  /** Terms for liquor/venue licensing */
  liquorTerms: string[];
  /** Terms for real estate */
  realEstateTerms: string[];
  /** Common local phrases */
  localPhrases: string[];
  /** Currency symbol */
  currencySymbol: string;
  /** Currency name */
  currencyName: string;
}

/**
 * Zone configuration within a city
 */
export interface CityZone {
  /** Display name */
  name: string;
  /** Flâneur neighborhood ID (URL slug) */
  neighborhoodId: string;
  /** Editorial tone for AI content */
  tone: string;
  /** Zone identifier from local system (ward, borough, LGA, etc.) */
  zoneCode?: string;
  /** Alternative zone identifiers */
  altCodes?: string[];
  /** Zip/postal codes if applicable */
  postalCodes?: string[];
}

/**
 * City configuration
 */
export interface CityConfig {
  /** City name */
  city: string;
  /** Country name */
  country: string;
  /** Adapter class name */
  adapter: string;
  /** Currency code */
  currency: string;
  /** Coverage zones */
  zones: CityZone[];
  /** API endpoints */
  endpoints?: {
    permits?: string;
    liquor?: string;
    safety?: string;
  };
}

/**
 * Base adapter class with common functionality
 */
export abstract class BaseCityAdapter implements ICityAdapter {
  abstract readonly city: string;
  abstract readonly country: string;
  abstract readonly currency: string;
  abstract readonly vocabulary: CityVocabulary;

  protected config: CityConfig;

  constructor(config: CityConfig) {
    this.config = config;
  }

  abstract getPermits(since?: Date): Promise<StoryData[]>;
  abstract getLiquor(since?: Date): Promise<StoryData[]>;
  abstract getSafety(period?: 'week' | 'month'): Promise<SafetyStats[]>;

  /**
   * Map location to neighborhood using zone configuration
   */
  mapToNeighborhood(location: string, zoneCode?: string): string | null {
    const upperLocation = location.toUpperCase();

    // First try exact zone code match
    if (zoneCode) {
      const zone = this.config.zones.find(
        (z) =>
          z.zoneCode === zoneCode ||
          z.altCodes?.includes(zoneCode)
      );
      if (zone) return zone.neighborhoodId;
    }

    // Try postal code match
    for (const zone of this.config.zones) {
      if (zone.postalCodes) {
        for (const postal of zone.postalCodes) {
          if (upperLocation.includes(postal)) {
            return zone.neighborhoodId;
          }
        }
      }
    }

    // Try name match
    for (const zone of this.config.zones) {
      if (upperLocation.includes(zone.name.toUpperCase())) {
        return zone.neighborhoodId;
      }
    }

    return null;
  }

  /**
   * Get zone by neighborhood ID
   */
  protected getZone(neighborhoodId: string): CityZone | undefined {
    return this.config.zones.find((z) => z.neighborhoodId === neighborhoodId);
  }

  /**
   * Get editorial tone for a neighborhood
   */
  getTone(neighborhoodId: string): string {
    const zone = this.getZone(neighborhoodId);
    return zone?.tone || `Local ${this.city} neighborhood`;
  }

  /**
   * Format currency value
   */
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency,
      maximumFractionDigits: 0,
    }).format(value);
  }

  /**
   * Check if a value meets the luxury threshold
   * Default: $1M USD equivalent
   */
  protected meetsLuxuryThreshold(value: number): boolean {
    const thresholds: Record<string, number> = {
      USD: 1000000,
      GBP: 800000,
      AUD: 1500000,
      EUR: 900000,
    };
    return value >= (thresholds[this.currency] || 1000000);
  }

  /**
   * Check if description contains luxury keywords
   */
  protected hasLuxuryKeywords(text: string): boolean {
    const keywords = [
      'luxury',
      'premium',
      'high-end',
      'exclusive',
      'penthouse',
      'mansion',
      'estate',
      'waterfront',
      'harbor',
      'harbour',
      'lakefront',
      'renovation',
      'restoration',
      'historic',
      'listed',
      'heritage',
      'pool',
      'spa',
      'cinema',
      'wine cellar',
      'basement',
      'excavation',
      'amalgamation',
      'consolidation',
    ];
    const lower = text.toLowerCase();
    return keywords.some((kw) => lower.includes(kw));
  }
}
