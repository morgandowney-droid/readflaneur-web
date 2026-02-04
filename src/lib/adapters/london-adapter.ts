/**
 * London City Adapter
 *
 * Fetches civic data from UK data sources:
 * - Permits: Borough Planning Registers (Westminster, Kensington & Chelsea)
 * - Liquor: Licensing Sub-Committee registers
 * - Safety: Metropolitan Police Service (MPS) API
 *
 * Data is filtered to Flâneur coverage zones (Mayfair, Chelsea, Kensington, etc.)
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

// UK Police API endpoint
const POLICE_API = 'https://data.police.uk/api';

// Planning portal endpoints (these are illustrative - actual URLs vary by borough)
const WESTMINSTER_PLANNING = 'https://idoxpa.westminster.gov.uk/online-applications/search.do';
const RBKC_PLANNING = 'https://www.rbkc.gov.uk/planning/searches/';

/**
 * London adapter for UK civic data
 */
export class LondonAdapter extends BaseCityAdapter {
  readonly city = 'London';
  readonly country = 'UK';
  readonly currency = 'GBP';
  readonly vocabulary: CityVocabulary;

  constructor() {
    super(GLOBAL_CITY_CONFIG['London']);
    this.vocabulary = CITY_VOCABULARIES['London'];
  }

  /**
   * Fetch planning applications from London borough planning portals
   *
   * Filters for luxury indicators:
   * - Basement excavations (iceberg homes)
   * - Listed building works
   * - Major renovations (estimated >£800k)
   * - Amalgamation of flats
   */
  async getPermits(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const permits: StoryData[] = [];

    // Keywords that indicate luxury development
    const luxuryKeywords = [
      'basement',
      'excavation',
      'subterranean',
      'listed building',
      'grade ii',
      'grade i',
      'amalgamation',
      'mansions',
      'mews',
      'penthouse',
      'lateral',
      'garden square',
      'swimming pool',
      'lift installation',
      'wine cellar',
    ];

    try {
      // Fetch from Westminster Planning Portal
      const westminsterData = await this.fetchWestminsterPlanning(sinceDate);
      permits.push(...westminsterData);

      // Fetch from RBKC Planning Portal
      const rbkcData = await this.fetchRBKCPlanning(sinceDate);
      permits.push(...rbkcData);

      // Filter for luxury indicators
      return permits.filter((p) => {
        const text = `${p.title} ${p.description}`.toLowerCase();
        return luxuryKeywords.some((kw) => text.includes(kw)) ||
               (p.value && p.value >= 800000);
      });
    } catch (error) {
      console.error('London permits fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch Westminster planning applications
   */
  private async fetchWestminsterPlanning(since: Date): Promise<StoryData[]> {
    // Westminster uses IDOX planning portal
    // In production, this would scrape or use their API
    // For now, return empty as scraping requires specific implementation
    console.log(`Would fetch Westminster planning since ${since.toISOString()}`);

    // Placeholder: In production, implement actual API/scraping
    // Example of what the data structure would look like:
    /*
    const response = await fetch(`${WESTMINSTER_PLANNING}?dateFrom=${since.toISOString()}`);
    const data = await response.json();
    return data.applications.map(app => ({
      sourceId: app.reference,
      dataType: 'permit',
      address: app.address,
      zone: 'Westminster',
      neighborhoodId: this.mapToNeighborhood(app.address, 'Westminster'),
      date: app.submittedDate,
      title: app.proposal,
      description: app.description,
      category: app.applicationType,
      rawData: app,
    }));
    */

    return [];
  }

  /**
   * Fetch RBKC (Kensington & Chelsea) planning applications
   */
  private async fetchRBKCPlanning(since: Date): Promise<StoryData[]> {
    console.log(`Would fetch RBKC planning since ${since.toISOString()}`);
    // Similar to Westminster - requires specific implementation
    return [];
  }

  /**
   * Fetch premises/liquor licenses from council licensing registers
   *
   * Filters for:
   * - New premises licenses
   * - Late-night venues
   * - Members clubs
   */
  async getLiquor(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const licenses: StoryData[] = [];

    try {
      // Licensing data typically comes from council sub-committee agendas
      // These are often PDFs that need parsing
      console.log(`Would fetch London licensing since ${sinceDate.toISOString()}`);

      // Placeholder for actual implementation
      return licenses;
    } catch (error) {
      console.error('London liquor fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch crime statistics from UK Police API
   *
   * The Police API provides crime data by:
   * - Specific point (lat/long)
   * - Custom area (polygon)
   * - Neighbourhood
   */
  async getSafety(period: 'week' | 'month' = 'month'): Promise<SafetyStats[]> {
    const stats: SafetyStats[] = [];

    try {
      for (const zone of this.config.zones) {
        const zoneStats = await this.fetchPoliceData(zone.neighborhoodId, period);
        if (zoneStats) {
          stats.push(zoneStats);
        }
      }

      return stats;
    } catch (error) {
      console.error('London safety fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch crime data from UK Police API for a specific area
   */
  private async fetchPoliceData(
    neighborhoodId: string,
    period: 'week' | 'month'
  ): Promise<SafetyStats | null> {
    const zone = this.config.zones.find((z) => z.neighborhoodId === neighborhoodId);
    if (!zone) return null;

    // Get coordinates for the zone (would need to be configured)
    // Using approximate center points for London zones
    const coordinates: Record<string, { lat: number; lng: number }> = {
      mayfair: { lat: 51.5074, lng: -0.1478 },
      chelsea: { lat: 51.4875, lng: -0.1687 },
      kensington: { lat: 51.5, lng: -0.1925 },
      'notting-hill': { lat: 51.509, lng: -0.205 },
      belgravia: { lat: 51.498, lng: -0.153 },
    };

    const coords = coordinates[neighborhoodId];
    if (!coords) return null;

    try {
      // UK Police API - get crimes at location
      // Date format: YYYY-MM
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

      const url = `${POLICE_API}/crimes-at-location?date=${dateStr}&lat=${coords.lat}&lng=${coords.lng}`;

      const response = await fetch(url);

      if (!response.ok) {
        console.error(`Police API error: ${response.status}`);
        return null;
      }

      const crimes = await response.json();

      // Aggregate by category
      const byCategory: Record<string, number> = {};
      for (const crime of crimes) {
        const cat = crime.category || 'other';
        byCategory[cat] = (byCategory[cat] || 0) + 1;
      }

      // Calculate period
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
        totalIncidents: crimes.length,
        byCategory,
      };
    } catch (error) {
      console.error(`Failed to fetch police data for ${neighborhoodId}:`, error);
      return null;
    }
  }

  /**
   * Map London address to neighborhood
   */
  mapToNeighborhood(location: string, borough?: string): string | null {
    const upper = location.toUpperCase();

    // Check postal codes first (most reliable)
    for (const zone of this.config.zones) {
      if (zone.postalCodes) {
        for (const postal of zone.postalCodes) {
          if (upper.includes(postal)) {
            return zone.neighborhoodId;
          }
        }
      }
    }

    // Check for neighborhood names in address
    if (upper.includes('MAYFAIR') || upper.includes('PARK LANE')) {
      return 'mayfair';
    }
    if (upper.includes('CHELSEA') || upper.includes('KING\'S ROAD') || upper.includes('SLOANE')) {
      return 'chelsea';
    }
    if (upper.includes('KENSINGTON') && !upper.includes('SOUTH KENSINGTON')) {
      return 'kensington';
    }
    if (upper.includes('NOTTING HILL') || upper.includes('PORTOBELLO')) {
      return 'notting-hill';
    }
    if (upper.includes('BELGRAVIA') || upper.includes('EATON') || upper.includes('CHESTER SQUARE')) {
      return 'belgravia';
    }

    // Use borough as fallback
    if (borough) {
      return super.mapToNeighborhood(location, borough);
    }

    return null;
  }
}
