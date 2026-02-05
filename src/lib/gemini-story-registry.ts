/**
 * Gemini Story Registry
 *
 * Central registry of all Gemini-enriched story generators.
 * Use this to apply formatting changes across all story types.
 *
 * All generators in this registry:
 * - Use Gemini for story generation
 * - Support link_candidates for hyperlink injection
 * - Return JSON with { headline, body, previewText?, link_candidates }
 */

export interface GeminiStoryGenerator {
  /** Unique identifier for the story type */
  id: string;
  /** Display name for the story type */
  name: string;
  /** File path relative to src/lib */
  file: string;
  /** Function name that generates stories */
  generatorFunction: string;
  /** Category label used in feeds */
  categoryLabel: string;
  /** Brief description */
  description: string;
}

/**
 * Complete registry of all Gemini-enriched story generators
 */
export const GEMINI_STORY_GENERATORS: GeminiStoryGenerator[] = [
  // ============================================================================
  // DAILY BRIEFS & CORE CONTENT
  // ============================================================================
  {
    id: 'daily-brief',
    name: 'Daily Brief',
    file: 'brief-enricher-gemini.ts',
    generatorFunction: 'enrichBriefWithGemini',
    categoryLabel: 'Daily Brief',
    description: 'Neighborhood daily news briefs with Google Search grounding',
  },

  // ============================================================================
  // NYC-SPECIFIC STORIES
  // ============================================================================
  {
    id: 'set-life',
    name: 'Set Life (Film Permits)',
    file: 'nyc-filming.ts',
    generatorFunction: 'generateFilmingStory',
    categoryLabel: 'Set Life',
    description: 'Film and TV production permits affecting neighborhoods',
  },
  {
    id: 'al-fresco',
    name: 'Al Fresco Alert',
    file: 'nyc-alfresco.ts',
    generatorFunction: 'generateAlfrescoStory',
    categoryLabel: 'Al Fresco Alert',
    description: 'New outdoor dining permits and sidewalk seating',
  },
  {
    id: 'heritage-watch',
    name: 'Heritage Watch',
    file: 'nyc-heritage.ts',
    generatorFunction: 'generateHeritageStory',
    categoryLabel: 'Heritage Watch',
    description: 'Demolition permits, landmark alterations, tree removal',
  },
  {
    id: 'nuisance-watch',
    name: 'Nuisance Watch',
    file: 'nuisance-watch.ts',
    generatorFunction: 'generateNuisanceStory',
    categoryLabel: 'Community Watch',
    description: '311 complaint clustering for quality-of-life issues',
  },

  // ============================================================================
  // AUCTION STORIES
  // ============================================================================
  {
    id: 'nyc-auctions',
    name: 'NYC Auction Watch',
    file: 'nyc-auctions.ts',
    generatorFunction: 'generateAuctionStory',
    categoryLabel: 'Auction Alert',
    description: 'Big Three auction house sales in NYC',
  },
  {
    id: 'global-auctions',
    name: 'Global Auction Watch',
    file: 'global-auctions.ts',
    generatorFunction: 'generateGlobalAuctionStory',
    categoryLabel: 'Auction Alert',
    description: 'Auction sales across 5 global art hubs',
  },
  {
    id: 'specialty-auctions-national',
    name: 'Specialty Auctions (National)',
    file: 'specialty-auctions.ts',
    generatorFunction: 'generateNationalChampionStory',
    categoryLabel: 'Local Gavel',
    description: 'Regional auction houses (Bukowskis, Dorotheum, etc.)',
  },
  {
    id: 'specialty-auctions-vacation',
    name: 'Specialty Auctions (Vacation)',
    file: 'specialty-auctions.ts',
    generatorFunction: 'generateVacationMappedStory',
    categoryLabel: 'Market Watch',
    description: 'Auction sales relevant to vacation destinations',
  },

  // ============================================================================
  // CULTURE & ARTS
  // ============================================================================
  {
    id: 'museum-watch',
    name: 'Culture Watch (Museums)',
    file: 'museum-watch.ts',
    generatorFunction: 'generateExhibitionStory',
    categoryLabel: 'Culture Watch',
    description: 'Museum exhibitions and member previews',
  },
  {
    id: 'art-fairs',
    name: 'Art Fair Coverage',
    file: 'art-fairs.ts',
    generatorFunction: 'generateArtFairStory',
    categoryLabel: 'Art Fair',
    description: 'Big 5 art fairs (Basel, Frieze, etc.)',
  },
  {
    id: 'overture-alert',
    name: 'Overture Alert',
    file: 'overture-alert.ts',
    generatorFunction: 'generateOvertureStory',
    categoryLabel: 'Curtain Up',
    description: 'Opera, ballet, symphony premieres',
  },

  // ============================================================================
  // RETAIL & COMMERCE
  // ============================================================================
  {
    id: 'retail-watch',
    name: 'Retail Watch',
    file: 'retail-watch.ts',
    generatorFunction: 'generateRetailStory',
    categoryLabel: 'Retail Watch',
    description: 'Signage permits for 80+ luxury brands',
  },
  {
    id: 'sample-sale',
    name: 'Sample Scout',
    file: 'sample-sale.ts',
    generatorFunction: 'generateSampleSaleStory',
    categoryLabel: 'Style Alert',
    description: 'Designer sample sales and flash sales',
  },
  {
    id: 'archive-hunter',
    name: 'Archive Hunter',
    file: 'archive-hunter.ts',
    generatorFunction: 'generateArchiveStory',
    categoryLabel: 'Archive Alert',
    description: 'Vintage luxury finds at consignment stores',
  },

  // ============================================================================
  // DINING & HOSPITALITY
  // ============================================================================
  {
    id: 'review-watch',
    name: 'Review Watch',
    file: 'review-watch.ts',
    generatorFunction: 'generateReviewStory',
    categoryLabel: 'Dining Watch',
    description: 'Restaurant reviews from 15+ RSS feeds',
  },

  // ============================================================================
  // FASHION
  // ============================================================================
  {
    id: 'fashion-week',
    name: 'Runway Protocol',
    file: 'fashion-week.ts',
    generatorFunction: 'generateFashionWeekStory',
    categoryLabel: 'Runway Watch',
    description: 'Big Four fashion weeks coverage',
  },
  {
    id: 'design-week',
    name: 'Design Circuit',
    file: 'design-week.ts',
    generatorFunction: 'generateDesignWeekStory',
    categoryLabel: 'Design Week',
    description: 'Milan Design Week, Salone, etc.',
  },

  // ============================================================================
  // SOCIAL & EVENTS
  // ============================================================================
  {
    id: 'gala-watch',
    name: 'Gala Watch',
    file: 'gala-watch.ts',
    generatorFunction: 'generateGalaStory',
    categoryLabel: 'Social Calendar',
    description: 'Charity galas and society events across 10 hubs',
  },

  // ============================================================================
  // TRAVEL & LIFESTYLE
  // ============================================================================
  {
    id: 'escape-index',
    name: 'Escape Index',
    file: 'escape-index.ts',
    generatorFunction: 'generateEscapeStory',
    categoryLabel: 'Escape Index',
    description: 'Weekend getaway conditions (snow/surf/sun)',
  },
  {
    id: 'residency-radar',
    name: 'Residency Radar',
    file: 'residency-radar.ts',
    generatorFunction: 'generateResidencyStory',
    categoryLabel: 'Scene Watch',
    description: 'Luxury brand pop-ups at vacation destinations',
  },
  {
    id: 'route-alert',
    name: 'Direct Connect',
    file: 'route-alert.ts',
    generatorFunction: 'generateRouteStory',
    categoryLabel: 'Flight Check',
    description: 'New direct premium flight routes',
  },

  // ============================================================================
  // CIVIC & POLITICAL
  // ============================================================================
  {
    id: 'nimby-alert',
    name: 'NIMBY Alert',
    file: 'nimby-alert.ts',
    generatorFunction: 'generateNimbyStory',
    categoryLabel: 'Civic Alert',
    description: 'Community board meeting controversies',
  },
  {
    id: 'political-wallet',
    name: 'Political Wallet',
    file: 'political-wallet.ts',
    generatorFunction: 'generatePoliticalStory',
    categoryLabel: 'Donor Watch',
    description: 'Neighborhood political donation trends',
  },
];

/**
 * Get a story generator by ID
 */
export function getGeneratorById(id: string): GeminiStoryGenerator | undefined {
  return GEMINI_STORY_GENERATORS.find((g) => g.id === id);
}

/**
 * Get all story generators for a category
 */
export function getGeneratorsByCategory(categoryLabel: string): GeminiStoryGenerator[] {
  return GEMINI_STORY_GENERATORS.filter((g) => g.categoryLabel === categoryLabel);
}

/**
 * Get count of all Gemini story generators
 */
export function getGeneratorCount(): number {
  return GEMINI_STORY_GENERATORS.length;
}
