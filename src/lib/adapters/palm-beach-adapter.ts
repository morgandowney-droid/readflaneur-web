/**
 * Palm Beach Adapter
 *
 * Old Money Resort - NYC's Winter Escape.
 *
 * Data sources:
 * - Permits: Town of Palm Beach Building Division
 * - Liquor: FL DBPR
 * - Safety: Palm Beach Police
 *
 * SPECIAL FEATURE: "Design Watch" - ARCOM Monitoring
 * The Architectural Commission (ARCOM) controls everything visible
 * from the street - colors, landscaping, materials, demolitions.
 * Wealthy residents fight fiercely over aesthetic changes.
 * Source: Town of Palm Beach ARCOM Agendas
 *
 * Coverage: Palm Beach Island
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
  'south ocean boulevard',
  'north ocean boulevard',
  'north lake way',
  'south lake drive',
  'north county road',
  'south county road',
  'worth avenue',
  'sea view avenue',
  'el bravo way',
  'el vedado',
  'jungle road',
  'banyan road',
  'root trail',
  'estate road',
];

// ARCOM agenda keywords that indicate significant changes
const ARCOM_KEYWORDS = [
  'demolition',
  'new construction',
  'new estate',
  'landscape plan',
  'major alteration',
  'addition',
  'pool',
  'seawall',
  'dock',
  'garage',
  'guest house',
  'cabana',
  'color change',
  'roof material',
  'wall modification',
];

/**
 * ARCOM Agenda item
 */
export interface ARCOMAgendaItem {
  address: string;
  applicant: string;
  projectType: string;
  description: string;
  meetingDate: string;
  caseNumber: string;
  status: 'Pending' | 'Approved' | 'Denied' | 'Continued';
}

/**
 * Palm Beach adapter for Florida civic data
 */
export class PalmBeachAdapter extends BaseCityAdapter {
  readonly city = 'Palm Beach';
  readonly country = 'USA';
  readonly currency = 'USD';
  readonly vocabulary: CityVocabulary;

  constructor() {
    super(GLOBAL_CITY_CONFIG['Palm Beach']);
    this.vocabulary = CITY_VOCABULARIES['Palm Beach'];
  }

  /**
   * Check if address is on a premium street
   */
  private isPremiumStreet(address: string): boolean {
    const lower = address.toLowerCase();
    return PREMIUM_STREETS.some((street) => lower.includes(street));
  }

  /**
   * Check if this is a significant ARCOM item
   */
  private isSignificantARCOMItem(text: string): boolean {
    const lower = text.toLowerCase();
    return ARCOM_KEYWORDS.some((kw) => lower.includes(kw));
  }

  /**
   * Fetch building permits
   */
  async getPermits(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const permits: StoryData[] = [];

    try {
      const pbData = await this.fetchPBPermits(sinceDate);
      permits.push(...pbData);

      return permits.filter((p) => {
        const text = `${p.title} ${p.description} ${p.address}`;

        // Premium streets always included
        if (this.isPremiumStreet(p.address)) return true;

        // High value permits ($1M+)
        if (p.value && p.value >= 1000000) return true;

        // Significant ARCOM items
        if (this.isSignificantARCOMItem(text)) return true;

        return this.hasLuxuryKeywords(text);
      });
    } catch (error) {
      console.error('Palm Beach permits fetch error:', error);
      return [];
    }
  }

  /**
   * Fetch Town of Palm Beach building permits
   */
  private async fetchPBPermits(since: Date): Promise<StoryData[]> {
    console.log(`Would fetch PB permits since ${since.toISOString()}`);
    // Town of Palm Beach Building Division
    return [];
  }

  /**
   * Fetch liquor licenses from FL DBPR
   */
  async getLiquor(since?: Date): Promise<StoryData[]> {
    const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    console.log(`Would fetch DBPR licenses since ${sinceDate.toISOString()}`);
    return [];
  }

  /**
   * Fetch crime statistics from Palm Beach Police
   */
  async getSafety(period: 'week' | 'month' = 'month'): Promise<SafetyStats[]> {
    const stats: SafetyStats[] = [];

    for (const zone of this.config.zones) {
      console.log(`Would fetch PBPD data for ${zone.name}`);
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
  // SPECIAL FEATURE: "Design Watch" - ARCOM Monitoring
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetch upcoming ARCOM agenda items
   * The Architectural Commission meets 2x/month and controls
   * all visible exterior changes on the island.
   */
  async getARCOMAgenda(): Promise<ARCOMAgendaItem[]> {
    try {
      // Town of Palm Beach ARCOM calendar
      // URL: https://www.townofpalmbeach.com/165/Architectural-Commission
      console.log('Would fetch ARCOM agenda');

      // In production:
      // 1. Fetch agenda PDF or HTML
      // 2. Parse for addresses, project types, applicants
      // 3. Filter for significant items

      return [];
    } catch (error) {
      console.error('ARCOM agenda fetch error:', error);
      return [];
    }
  }

  /**
   * Generate Design Watch story for ARCOM item
   */
  generateDesignWatchStory(item: ARCOMAgendaItem): string {
    const projectDesc = item.projectType.toLowerCase();
    let storyType = 'changes';

    if (projectDesc.includes('demolition')) {
      storyType = 'Demolition proposed';
    } else if (projectDesc.includes('new construction') || projectDesc.includes('new estate')) {
      storyType = 'New estate plans submitted';
    } else if (projectDesc.includes('landscape')) {
      storyType = 'Landscape changes proposed';
    } else if (projectDesc.includes('addition') || projectDesc.includes('alteration')) {
      storyType = 'Major renovation proposed';
    }

    return `Design Watch: ARCOM reviews plans for ${item.address}. ${storyType}.`;
  }

  /**
   * Get all significant upcoming ARCOM items with generated stories
   */
  async getDesignWatchStories(): Promise<{ item: ARCOMAgendaItem; story: string }[]> {
    const agenda = await this.getARCOMAgenda();
    const stories: { item: ARCOMAgendaItem; story: string }[] = [];

    for (const item of agenda) {
      const text = `${item.projectType} ${item.description}`;
      if (this.isSignificantARCOMItem(text) || this.isPremiumStreet(item.address)) {
        stories.push({
          item,
          story: this.generateDesignWatchStory(item),
        });
      }
    }

    return stories;
  }

  /**
   * Map Palm Beach address to neighborhood
   */
  mapToNeighborhood(location: string, zoneCode?: string): string | null {
    const upper = location.toUpperCase();

    // Palm Beach Island - everything maps to one neighborhood
    if (
      upper.includes('PALM BEACH') ||
      upper.includes('33480') ||
      upper.includes('SOUTH OCEAN') ||
      upper.includes('NORTH OCEAN') ||
      upper.includes('WORTH AVENUE') ||
      upper.includes('COUNTY ROAD') ||
      upper.includes('LAKE WAY')
    ) {
      return 'palm-beach-island';
    }

    return super.mapToNeighborhood(location, zoneCode);
  }
}
