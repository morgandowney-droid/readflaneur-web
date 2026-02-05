/**
 * Political Wallet Service
 *
 * Aggregates political contribution data to show residents
 * "Who the neighborhood is betting on."
 *
 * Strategy: "Follow the Money"
 * - Aggregate donations by zip code to show trends
 * - Focus on "Power Donors" ($1,000+)
 * - Never doxx individuals (aggregate only)
 * - Show volume and direction of money
 *
 * Data Sources:
 * - US: FEC API (Federal Election Commission)
 * - UK: Electoral Commission API
 *
 * Schedule: Weekly on Tuesdays at 7 AM UTC (after Monday FEC updates)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// TYPES
// ============================================================================

export type PoliticalRegion = 'US' | 'UK';

export type RecipientType = 'candidate' | 'pac' | 'party' | 'committee';

export interface DonationRecord {
  id: string;
  amount: number;
  currency: string;
  date: Date;
  recipientName: string;
  recipientType: RecipientType;
  recipientParty?: string;
  contributorZip: string;
  contributorCity?: string;
  contributorState?: string;
  isIndividual: boolean;
  // We do NOT store individual names for privacy
}

export interface NeighborhoodTrend {
  neighborhoodId: string;
  neighborhoodName: string;
  zipCodes: string[];
  totalVolume: number;
  donorCount: number;
  topRecipients: RecipientTrend[];
  partyBreakdown: Record<string, number>;
  periodStart: Date;
  periodEnd: Date;
}

export interface RecipientTrend {
  recipientName: string;
  recipientType: RecipientType;
  recipientParty?: string;
  totalAmount: number;
  donorCount: number;
  averageDonation: number;
}

export interface PoliticalStory {
  trend: NeighborhoodTrend;
  topRecipient: RecipientTrend;
  headline: string;
  body: string;
  previewText: string;
  categoryLabel: string;
  targetNeighborhoods: string[];
}

// ============================================================================
// NEIGHBORHOOD ZIP CODE MAPPINGS
// ============================================================================

export const NEIGHBORHOOD_ZIPS: Record<string, { name: string; zips: string[]; region: PoliticalRegion }> = {
  // NYC
  'nyc-upper-east-side': {
    name: 'Upper East Side',
    zips: ['10021', '10028', '10065', '10075', '10128'],
    region: 'US',
  },
  'nyc-upper-west-side': {
    name: 'Upper West Side',
    zips: ['10023', '10024', '10025', '10069'],
    region: 'US',
  },
  'nyc-tribeca': {
    name: 'Tribeca',
    zips: ['10007', '10013', '10282'],
    region: 'US',
  },
  'nyc-soho': {
    name: 'SoHo',
    zips: ['10012', '10013'],
    region: 'US',
  },
  'nyc-west-village': {
    name: 'West Village',
    zips: ['10014'],
    region: 'US',
  },
  'nyc-greenwich-village': {
    name: 'Greenwich Village',
    zips: ['10003', '10011', '10012'],
    region: 'US',
  },
  'nyc-chelsea': {
    name: 'Chelsea',
    zips: ['10001', '10011'],
    region: 'US',
  },
  'nyc-fidi': {
    name: 'FiDi',
    zips: ['10004', '10005', '10006', '10007', '10038'],
    region: 'US',
  },
  'nyc-brooklyn-heights': {
    name: 'Brooklyn Heights',
    zips: ['11201'],
    region: 'US',
  },
  'nyc-park-slope': {
    name: 'Park Slope',
    zips: ['11215', '11217'],
    region: 'US',
  },
  'nyc-williamsburg': {
    name: 'Williamsburg',
    zips: ['11211', '11249'],
    region: 'US',
  },

  // Los Angeles
  'la-beverly-hills': {
    name: 'Beverly Hills',
    zips: ['90210', '90211', '90212'],
    region: 'US',
  },
  'la-bel-air': {
    name: 'Bel Air',
    zips: ['90077'],
    region: 'US',
  },
  'la-brentwood': {
    name: 'Brentwood',
    zips: ['90049'],
    region: 'US',
  },
  'la-pacific-palisades': {
    name: 'Pacific Palisades',
    zips: ['90272'],
    region: 'US',
  },
  'la-west-hollywood': {
    name: 'West Hollywood',
    zips: ['90046', '90048', '90069'],
    region: 'US',
  },
  'la-malibu': {
    name: 'Malibu',
    zips: ['90265'],
    region: 'US',
  },

  // San Francisco
  'sf-pacific-heights': {
    name: 'Pacific Heights',
    zips: ['94115', '94123'],
    region: 'US',
  },
  'sf-nob-hill': {
    name: 'Nob Hill',
    zips: ['94108', '94109'],
    region: 'US',
  },
  'sf-russian-hill': {
    name: 'Russian Hill',
    zips: ['94109'],
    region: 'US',
  },

  // Chicago
  'chicago-gold-coast': {
    name: 'Gold Coast',
    zips: ['60610', '60611'],
    region: 'US',
  },
  'chicago-lincoln-park': {
    name: 'Lincoln Park',
    zips: ['60614', '60657'],
    region: 'US',
  },

  // Miami
  'miami-miami-beach': {
    name: 'Miami Beach',
    zips: ['33139', '33140', '33141'],
    region: 'US',
  },
  'miami-coral-gables': {
    name: 'Coral Gables',
    zips: ['33134', '33143', '33146'],
    region: 'US',
  },

  // Washington DC
  'dc-georgetown': {
    name: 'Georgetown',
    zips: ['20007'],
    region: 'US',
  },
  'dc-dupont-circle': {
    name: 'Dupont Circle',
    zips: ['20036', '20009'],
    region: 'US',
  },

  // London (UK postcodes)
  'london-mayfair': {
    name: 'Mayfair',
    zips: ['W1J', 'W1K', 'W1S'],
    region: 'UK',
  },
  'london-chelsea': {
    name: 'Chelsea',
    zips: ['SW3', 'SW10'],
    region: 'UK',
  },
  'london-kensington': {
    name: 'Kensington',
    zips: ['W8', 'W14'],
    region: 'UK',
  },
  'london-notting-hill': {
    name: 'Notting Hill',
    zips: ['W11'],
    region: 'UK',
  },
  'london-hampstead': {
    name: 'Hampstead',
    zips: ['NW3'],
    region: 'US',
  },
};

// Thresholds
export const POWER_DONOR_THRESHOLD = 1000; // $1,000 minimum
export const STORY_TRIGGER_THRESHOLD = 10000; // $10k from single neighborhood triggers story
export const LOOKBACK_DAYS = 7;

// ============================================================================
// FEC API ADAPTER (US)
// ============================================================================

const FEC_API_KEY = process.env.FEC_API_KEY || 'DEMO_KEY';
const FEC_BASE_URL = 'https://api.open.fec.gov/v1';

interface FECContribution {
  contribution_receipt_amount: number;
  contribution_receipt_date: string;
  contributor_zip: string;
  contributor_city: string;
  contributor_state: string;
  committee_name: string;
  committee_id: string;
  recipient_committee_type: string;
  entity_type: string;
}

/**
 * Fetch contributions from FEC API for given zip codes
 */
async function fetchFECContributions(
  zipCodes: string[],
  minAmount: number = POWER_DONOR_THRESHOLD
): Promise<DonationRecord[]> {
  const donations: DonationRecord[] = [];
  const now = new Date();
  const lookbackDate = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Get current election cycle (even year)
  const currentYear = now.getFullYear();
  const cycleYear = currentYear % 2 === 0 ? currentYear : currentYear + 1;

  for (const zip of zipCodes) {
    try {
      const params = new URLSearchParams({
        api_key: FEC_API_KEY,
        contributor_zip: zip,
        min_amount: minAmount.toString(),
        two_year_transaction_period: cycleYear.toString(),
        min_date: lookbackDate.toISOString().split('T')[0],
        per_page: '100',
        sort: '-contribution_receipt_date',
      });

      const response = await fetch(
        `${FEC_BASE_URL}/schedules/schedule_a/?${params}`,
        {
          headers: {
            'User-Agent': 'Flaneur/1.0 (Political Transparency Research)',
          },
        }
      );

      if (!response.ok) {
        console.error(`FEC API error for zip ${zip}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const results = data.results as FECContribution[];

      for (const contrib of results) {
        // Determine recipient type
        let recipientType: RecipientType = 'committee';
        const committeeType = contrib.recipient_committee_type?.toUpperCase() || '';
        if (committeeType === 'H' || committeeType === 'S' || committeeType === 'P') {
          recipientType = 'candidate';
        } else if (committeeType === 'O' || committeeType === 'U') {
          recipientType = 'pac';
        } else if (committeeType === 'X' || committeeType === 'Y') {
          recipientType = 'party';
        }

        // Determine party from committee name patterns
        let party: string | undefined;
        const committeeName = contrib.committee_name?.toLowerCase() || '';
        if (committeeName.includes('democrat') || committeeName.includes('(d)')) {
          party = 'Democrat';
        } else if (committeeName.includes('republican') || committeeName.includes('(r)')) {
          party = 'Republican';
        }

        donations.push({
          id: `fec-${contrib.committee_id}-${contrib.contribution_receipt_date}-${Math.random().toString(36).substring(7)}`,
          amount: contrib.contribution_receipt_amount,
          currency: 'USD',
          date: new Date(contrib.contribution_receipt_date),
          recipientName: contrib.committee_name,
          recipientType,
          recipientParty: party,
          contributorZip: contrib.contributor_zip,
          contributorCity: contrib.contributor_city,
          contributorState: contrib.contributor_state,
          isIndividual: contrib.entity_type === 'IND',
        });
      }
    } catch (error) {
      console.error(`Error fetching FEC data for zip ${zip}:`, error);
    }
  }

  return donations;
}

// ============================================================================
// UK ELECTORAL COMMISSION ADAPTER
// ============================================================================

const UK_EC_BASE_URL = 'http://search.electoralcommission.org.uk/api/search/Donations';

interface UKDonation {
  DonorName: string;
  Value: number;
  ReceivedDate: string;
  RegulatedEntityName: string;
  RegulatedEntityType: string;
  DonorPostcode: string;
  DonorStatus: string;
}

/**
 * Fetch donations from UK Electoral Commission for given postcodes
 */
async function fetchUKDonations(
  postcodes: string[],
  minAmount: number = POWER_DONOR_THRESHOLD
): Promise<DonationRecord[]> {
  const donations: DonationRecord[] = [];
  const now = new Date();
  const lookbackDate = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  for (const postcode of postcodes) {
    try {
      const params = new URLSearchParams({
        query: postcode,
        rows: '100',
        sort: 'ReceivedDate desc',
      });

      const response = await fetch(`${UK_EC_BASE_URL}?${params}`, {
        headers: {
          'User-Agent': 'Flaneur/1.0 (Political Transparency Research)',
        },
      });

      if (!response.ok) {
        console.error(`UK EC API error for postcode ${postcode}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const results = (data.Result || []) as UKDonation[];

      for (const donation of results) {
        // Filter by amount and date
        if (donation.Value < minAmount) continue;

        const donationDate = new Date(donation.ReceivedDate);
        if (donationDate < lookbackDate) continue;

        // Check if postcode matches (API does text search, need to verify)
        if (!donation.DonorPostcode?.toUpperCase().startsWith(postcode.toUpperCase())) {
          continue;
        }

        // Determine recipient type
        let recipientType: RecipientType = 'party';
        const entityType = donation.RegulatedEntityType?.toLowerCase() || '';
        if (entityType.includes('political party')) {
          recipientType = 'party';
        } else if (entityType.includes('member')) {
          recipientType = 'candidate';
        }

        // Determine party from entity name
        let party: string | undefined;
        const entityName = donation.RegulatedEntityName?.toLowerCase() || '';
        if (entityName.includes('conservative')) {
          party = 'Conservative';
        } else if (entityName.includes('labour')) {
          party = 'Labour';
        } else if (entityName.includes('liberal democrat')) {
          party = 'Liberal Democrat';
        }

        donations.push({
          id: `uk-${donation.RegulatedEntityName}-${donation.ReceivedDate}-${Math.random().toString(36).substring(7)}`,
          amount: donation.Value,
          currency: 'GBP',
          date: donationDate,
          recipientName: donation.RegulatedEntityName,
          recipientType,
          recipientParty: party,
          contributorZip: donation.DonorPostcode,
          isIndividual: donation.DonorStatus === 'Individual',
        });
      }
    } catch (error) {
      console.error(`Error fetching UK EC data for postcode ${postcode}:`, error);
    }
  }

  return donations;
}

// ============================================================================
// TREND ANALYSIS
// ============================================================================

/**
 * Aggregate donations into neighborhood trends
 */
export function aggregateTrends(
  donations: DonationRecord[],
  neighborhoodId: string,
  neighborhoodName: string,
  zipCodes: string[]
): NeighborhoodTrend {
  const now = new Date();
  const lookbackDate = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Group by recipient
  const recipientMap = new Map<string, {
    recipientName: string;
    recipientType: RecipientType;
    recipientParty?: string;
    totalAmount: number;
    donations: DonationRecord[];
  }>();

  const partyTotals: Record<string, number> = {};
  let totalVolume = 0;
  const uniqueDonors = new Set<string>();

  for (const donation of donations) {
    totalVolume += donation.amount;
    uniqueDonors.add(`${donation.contributorZip}-${donation.date.toISOString()}`);

    // Track by recipient
    const key = donation.recipientName;
    if (!recipientMap.has(key)) {
      recipientMap.set(key, {
        recipientName: donation.recipientName,
        recipientType: donation.recipientType,
        recipientParty: donation.recipientParty,
        totalAmount: 0,
        donations: [],
      });
    }
    const recipient = recipientMap.get(key)!;
    recipient.totalAmount += donation.amount;
    recipient.donations.push(donation);

    // Track by party
    if (donation.recipientParty) {
      partyTotals[donation.recipientParty] = (partyTotals[donation.recipientParty] || 0) + donation.amount;
    }
  }

  // Convert to sorted array of top recipients
  const topRecipients: RecipientTrend[] = Array.from(recipientMap.values())
    .map((r) => ({
      recipientName: r.recipientName,
      recipientType: r.recipientType,
      recipientParty: r.recipientParty,
      totalAmount: r.totalAmount,
      donorCount: r.donations.length,
      averageDonation: r.totalAmount / r.donations.length,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 10);

  return {
    neighborhoodId,
    neighborhoodName,
    zipCodes,
    totalVolume,
    donorCount: uniqueDonors.size,
    topRecipients,
    partyBreakdown: partyTotals,
    periodStart: lookbackDate,
    periodEnd: now,
  };
}

/**
 * Check if a trend should trigger a story
 */
export function shouldTriggerStory(trend: NeighborhoodTrend): boolean {
  // Check if any recipient exceeds threshold
  return trend.topRecipients.some((r) => r.totalAmount >= STORY_TRIGGER_THRESHOLD);
}

// ============================================================================
// GEMINI STORY GENERATION
// ============================================================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const POLITICAL_SYSTEM_PROMPT = `You are the Political Editor for Flâneur, a luxury neighborhood news platform.

Your tone is "Insider" - informative about where the smart money is going, without being partisan or judgmental.

Rules:
1. Never reveal individual donor names or identify specific people
2. Present data as aggregate trends, not individual contributions
3. Avoid partisan commentary - present facts neutrally
4. Focus on the "horse race" aspect - who's raising, who's momentum is building
5. Reference the neighborhood identity ("In [Neighborhood], the donor class is...")
6. Keep it concise and scannable

Format: Return JSON with "headline" and "body" keys.`;

export async function generatePoliticalStory(
  trend: NeighborhoodTrend
): Promise<PoliticalStory | null> {
  try {
    const topRecipient = trend.topRecipients[0];
    if (!topRecipient || topRecipient.totalAmount < STORY_TRIGGER_THRESHOLD) {
      return null;
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Format currency
    const formatAmount = (amount: number, currency: string = 'USD') => {
      const symbol = currency === 'GBP' ? '£' : '$';
      if (amount >= 1000000) {
        return `${symbol}${(amount / 1000000).toFixed(1)}M`;
      } else if (amount >= 1000) {
        return `${symbol}${(amount / 1000).toFixed(0)}K`;
      }
      return `${symbol}${amount.toFixed(0)}`;
    };

    const prompt = `You are the Political Editor for Flâneur in ${trend.neighborhoodName}.

Data for the past ${LOOKBACK_DAYS} days:
- Total donations from ${trend.neighborhoodName}: ${formatAmount(trend.totalVolume)}
- Number of Power Donors ($1,000+): ${trend.donorCount}

Top Recipients:
${trend.topRecipients.slice(0, 5).map((r, i) => `
${i + 1}. ${r.recipientName}${r.recipientParty ? ` (${r.recipientParty})` : ''}
   - Total raised from ${trend.neighborhoodName}: ${formatAmount(r.totalAmount)}
   - Number of donors: ${r.donorCount}
   - Average donation: ${formatAmount(r.averageDonation)}
`).join('\n')}

Party Breakdown:
${Object.entries(trend.partyBreakdown).map(([party, amount]) => `- ${party}: ${formatAmount(amount)}`).join('\n')}

Context:
- Audience: Wealthy donors who want to know where their peers are putting money.
- Tone: 'Insider'. 'The smart money in ${trend.neighborhoodName} is moving toward [Candidate].'
- NEVER mention individual donor names

Task: Write a 35-word blurb about the donation trends.
Headline: 'Donor Watch: [Recipient] raises $[Amount] in ${trend.neighborhoodName}'

Return JSON: { "headline": "...", "body": "..." }`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: POLITICAL_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 300,
      },
    });

    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error('No JSON found in Gemini response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      trend,
      topRecipient,
      headline: parsed.headline,
      body: parsed.body,
      previewText: parsed.body.substring(0, 120) + '...',
      categoryLabel: 'Donor Watch',
      targetNeighborhoods: [trend.neighborhoodId],
    };
  } catch (error) {
    console.error('Error generating political story:', error);
    return null;
  }
}

// ============================================================================
// MAIN PROCESSING PIPELINE
// ============================================================================

export interface ProcessResult {
  neighborhoodsScanned: number;
  donationsFound: number;
  trendsAnalyzed: number;
  storiesGenerated: number;
  byRegion: Record<string, number>;
  byParty: Record<string, number>;
  stories: PoliticalStory[];
  errors: string[];
}

/**
 * Process all neighborhoods and generate political wallet stories
 */
export async function processPoliticalWallet(): Promise<ProcessResult> {
  const result: ProcessResult = {
    neighborhoodsScanned: 0,
    donationsFound: 0,
    trendsAnalyzed: 0,
    storiesGenerated: 0,
    byRegion: {},
    byParty: {},
    stories: [],
    errors: [],
  };

  for (const [neighborhoodId, config] of Object.entries(NEIGHBORHOOD_ZIPS)) {
    try {
      console.log(`Processing ${config.name}...`);
      result.neighborhoodsScanned++;

      // Fetch donations based on region
      let donations: DonationRecord[];
      if (config.region === 'US') {
        donations = await fetchFECContributions(config.zips);
      } else if (config.region === 'UK') {
        donations = await fetchUKDonations(config.zips);
      } else {
        continue;
      }

      result.donationsFound += donations.length;
      result.byRegion[config.region] = (result.byRegion[config.region] || 0) + donations.length;

      if (donations.length === 0) {
        continue;
      }

      // Aggregate into trends
      const trend = aggregateTrends(donations, neighborhoodId, config.name, config.zips);
      result.trendsAnalyzed++;

      // Track party totals
      for (const [party, amount] of Object.entries(trend.partyBreakdown)) {
        result.byParty[party] = (result.byParty[party] || 0) + amount;
      }

      // Check if story should be generated
      if (!shouldTriggerStory(trend)) {
        continue;
      }

      // Generate story
      const story = await generatePoliticalStory(trend);
      if (story) {
        result.stories.push(story);
        result.storiesGenerated++;
      }
    } catch (error) {
      result.errors.push(`${config.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}

// ============================================================================
// SAMPLE DATA FOR TESTING
// ============================================================================

export function createSampleTrends(): NeighborhoodTrend[] {
  const now = new Date();
  const lookbackDate = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  return [
    {
      neighborhoodId: 'nyc-upper-east-side',
      neighborhoodName: 'Upper East Side',
      zipCodes: ['10021', '10028', '10065'],
      totalVolume: 287500,
      donorCount: 42,
      topRecipients: [
        {
          recipientName: 'Friends of Jane Smith for Senate',
          recipientType: 'candidate',
          recipientParty: 'Democrat',
          totalAmount: 125000,
          donorCount: 18,
          averageDonation: 6944,
        },
        {
          recipientName: 'John Doe for Congress',
          recipientType: 'candidate',
          recipientParty: 'Republican',
          totalAmount: 87500,
          donorCount: 12,
          averageDonation: 7292,
        },
        {
          recipientName: 'NYC Victory Fund',
          recipientType: 'pac',
          recipientParty: 'Democrat',
          totalAmount: 45000,
          donorCount: 8,
          averageDonation: 5625,
        },
      ],
      partyBreakdown: {
        Democrat: 170000,
        Republican: 87500,
        Independent: 30000,
      },
      periodStart: lookbackDate,
      periodEnd: now,
    },
    {
      neighborhoodId: 'la-beverly-hills',
      neighborhoodName: 'Beverly Hills',
      zipCodes: ['90210', '90211', '90212'],
      totalVolume: 425000,
      donorCount: 58,
      topRecipients: [
        {
          recipientName: 'California Senate Victory',
          recipientType: 'pac',
          recipientParty: 'Democrat',
          totalAmount: 175000,
          donorCount: 22,
          averageDonation: 7955,
        },
        {
          recipientName: 'Entertainment Industry PAC',
          recipientType: 'pac',
          totalAmount: 125000,
          donorCount: 15,
          averageDonation: 8333,
        },
      ],
      partyBreakdown: {
        Democrat: 325000,
        Republican: 75000,
        Independent: 25000,
      },
      periodStart: lookbackDate,
      periodEnd: now,
    },
  ];
}
