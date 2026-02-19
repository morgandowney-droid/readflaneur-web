/**
 * Singapore Market Watch Service
 *
 * Monitors two key Singapore wealth indicators:
 * 1. "Motor Watch" - COE (Certificate of Entitlement) bidding results
 * 2. "GCB Alert" - Good Class Bungalow transactions
 *
 * Feature A (COE): Trigger if Cat B (luxury cars >1600cc) price drops > $5k SGD
 * Feature B (GCB): Trigger if detached house transaction > $20M SGD
 *
 * Target neighborhoods: singapore-nassim, singapore-sentosa
 *
 * Data sources:
 * - COE: LTA (Land Transport Authority) DataMall
 * - GCB: URA (Urban Redevelopment Authority) Private Residential Transactions
 */

import { GoogleGenAI } from '@google/genai';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { AI_MODELS } from '@/config/ai-models';
import { insiderPersona } from '@/lib/ai-persona';

// LTA DataMall API
const LTA_DATAMALL_API = 'https://datamall2.mytransport.sg/ltaodataservice';

// URA API
const URA_API = 'https://www.ura.gov.sg/uraDataService';

// COE thresholds
const COE_DROP_THRESHOLD = 5000; // SGD - significant drop
const COE_CATEGORIES = {
  A: 'Cars ≤1600cc & ≤130bhp',
  B: 'Cars >1600cc or >130bhp (Luxury)', // Our focus
  C: 'Goods vehicles & buses',
  D: 'Motorcycles',
  E: 'Open (any vehicle)',
};

// GCB transaction threshold
const GCB_PRICE_THRESHOLD = 20000000; // $20M SGD

// GCB areas (39 gazetted zones)
const GCB_AREAS = [
  'Nassim Road',
  'Cluny Road',
  'Ridout Road',
  'Dalvey Road',
  'White House Park',
  'Holland Road',
  'Tanglin Road',
  'Leedon Park',
  'Caldecott Hill',
  'Chatsworth Park',
  'Bin Tong Park',
  'Queen Astrid Park',
  'Chee Hoon Avenue',
  'Victoria Park',
  'Cornwall Gardens',
  'Swiss Club',
  'King Albert Park',
  'Belmont',
  'Eng Neo',
  'Rebecca',
  'Oei Tiong Ham',
];

/**
 * COE bidding result
 */
export interface COEResult {
  category: 'A' | 'B' | 'C' | 'D' | 'E';
  description: string;
  premium: number; // SGD
  previousPremium: number;
  change: number;
  changePercent: number;
  quota: number;
  bidsReceived: number;
  biddingRound: string;
  biddingDate: string;
}

/**
 * GCB transaction record
 */
export interface GCBTransaction {
  transactionId: string;
  address: string;
  area: string;
  district: string;
  price: number; // SGD
  pricePerSqFt: number;
  landSize: number; // sq ft
  floorSize: number; // sq ft
  tenure: 'Freehold' | '999-year' | '99-year' | 'Unknown';
  transactionDate: string;
  propertyType: string;
  isNewRecord: boolean;
  neighborhoodId: string;
}

/**
 * Motor Watch alert
 */
export interface MotorWatchAlert {
  type: 'coe';
  neighborhoodId: string;
  headline: string;
  body: string;
  previewText: string;
  coeData: COEResult;
  generatedAt: string;
}

/**
 * GCB Alert
 */
export interface GCBAlert {
  type: 'gcb';
  neighborhoodId: string;
  headline: string;
  body: string;
  previewText: string;
  transaction: GCBTransaction;
  generatedAt: string;
}

/**
 * Combined Singapore market alerts
 */
export type SingaporeMarketAlert = MotorWatchAlert | GCBAlert;

/**
 * Fetch COE bidding results from LTA DataMall
 */
export async function fetchCOEResults(): Promise<COEResult[]> {
  const apiKey = process.env.LTA_DATAMALL_KEY;

  if (!apiKey) {
    console.log('LTA_DATAMALL_KEY not configured, using mock data');
    // Return mock data for development
    return getMockCOEResults();
  }

  try {
    const url = `${LTA_DATAMALL_API}/COEBiddingResults`;
    console.log('Fetching COE bidding results...');

    const response = await fetch(url, {
      headers: {
        AccountKey: apiKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`LTA DataMall API error: ${response.status}`);
      return getMockCOEResults();
    }

    const data = await response.json();
    const results: COEResult[] = [];

    for (const item of data.value || []) {
      const category = item.vehicle_class as 'A' | 'B' | 'C' | 'D' | 'E';
      const premium = parseFloat(item.premium) || 0;
      const prevPremium = parseFloat(item.previous_premium) || premium;
      const change = premium - prevPremium;

      results.push({
        category,
        description: COE_CATEGORIES[category] || 'Unknown',
        premium,
        previousPremium: prevPremium,
        change,
        changePercent: prevPremium > 0 ? (change / prevPremium) * 100 : 0,
        quota: parseInt(item.quota) || 0,
        bidsReceived: parseInt(item.bids_received) || 0,
        biddingRound: item.bidding_no || '',
        biddingDate: item.bidding_date || new Date().toISOString().split('T')[0],
      });
    }

    return results;
  } catch (error) {
    console.error('COE fetch error:', error);
    return getMockCOEResults();
  }
}

/**
 * Mock COE results for development
 */
function getMockCOEResults(): COEResult[] {
  const today = new Date().toISOString().split('T')[0];
  return [
    {
      category: 'A',
      description: COE_CATEGORIES.A,
      premium: 85000,
      previousPremium: 87000,
      change: -2000,
      changePercent: -2.3,
      quota: 1500,
      bidsReceived: 2100,
      biddingRound: '1',
      biddingDate: today,
    },
    {
      category: 'B',
      description: COE_CATEGORIES.B,
      premium: 120000,
      previousPremium: 126000,
      change: -6000, // Triggers alert!
      changePercent: -4.8,
      quota: 800,
      bidsReceived: 1100,
      biddingRound: '1',
      biddingDate: today,
    },
    {
      category: 'E',
      description: COE_CATEGORIES.E,
      premium: 125000,
      previousPremium: 128000,
      change: -3000,
      changePercent: -2.3,
      quota: 400,
      bidsReceived: 600,
      biddingRound: '1',
      biddingDate: today,
    },
  ];
}

/**
 * Fetch GCB transactions from URA
 */
export async function fetchGCBTransactions(
  daysBack: number = 30
): Promise<GCBTransaction[]> {
  const uraToken = process.env.URA_ACCESS_TOKEN;

  if (!uraToken) {
    console.log('URA_ACCESS_TOKEN not configured, using mock data');
    return getMockGCBTransactions();
  }

  try {
    // URA Private Residential Transactions API
    const url = `${URA_API}/invokeUraDS`;
    console.log('Fetching URA GCB transactions...');

    const response = await fetch(url, {
      headers: {
        AccessKey: uraToken,
        Token: uraToken,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`URA API error: ${response.status}`);
      return getMockGCBTransactions();
    }

    const data = await response.json();
    const transactions: GCBTransaction[] = [];

    // Filter for GCB-area transactions over $20M
    for (const item of data.Result || []) {
      const price = parseFloat(item.price) || 0;
      if (price < GCB_PRICE_THRESHOLD) continue;

      const propertyType = item.propertyType || '';
      if (!propertyType.toLowerCase().includes('detached')) continue;

      const address = item.street || '';
      const area = identifyGCBArea(address);
      if (!area) continue;

      const transactionId = `gcb-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      transactions.push({
        transactionId,
        address,
        area,
        district: item.district || 'D10',
        price,
        pricePerSqFt: parseFloat(item.unitPrice) || 0,
        landSize: parseFloat(item.area) || 0,
        floorSize: parseFloat(item.floorArea) || 0,
        tenure: parseTenure(item.tenure),
        transactionDate: item.contractDate || new Date().toISOString().split('T')[0],
        propertyType,
        isNewRecord: false, // Would need historical data to determine
        neighborhoodId: mapToNeighborhood(address),
      });
    }

    return transactions;
  } catch (error) {
    console.error('GCB fetch error:', error);
    return getMockGCBTransactions();
  }
}

/**
 * Mock GCB transactions for development
 */
function getMockGCBTransactions(): GCBTransaction[] {
  return [
    {
      transactionId: 'gcb-mock-001',
      address: '8 Nassim Road',
      area: 'Nassim Road',
      district: 'D10',
      price: 45000000,
      pricePerSqFt: 2800,
      landSize: 16000,
      floorSize: 12000,
      tenure: 'Freehold',
      transactionDate: new Date().toISOString().split('T')[0],
      propertyType: 'Detached House',
      isNewRecord: false,
      neighborhoodId: 'singapore-nassim',
    },
  ];
}

/**
 * Identify GCB area from address
 */
function identifyGCBArea(address: string): string | null {
  const upper = address.toUpperCase();
  for (const area of GCB_AREAS) {
    if (upper.includes(area.toUpperCase())) {
      return area;
    }
  }
  return null;
}

/**
 * Parse tenure string
 */
function parseTenure(
  tenure: string
): 'Freehold' | '999-year' | '99-year' | 'Unknown' {
  if (!tenure) return 'Unknown';
  const lower = tenure.toLowerCase();
  if (lower.includes('freehold')) return 'Freehold';
  if (lower.includes('999')) return '999-year';
  if (lower.includes('99')) return '99-year';
  return 'Unknown';
}

/**
 * Map address to neighborhood ID
 */
function mapToNeighborhood(address: string): string {
  const upper = address.toUpperCase();

  // Sentosa indicators
  if (
    upper.includes('SENTOSA') ||
    upper.includes('OCEAN DRIVE') ||
    upper.includes('COVE')
  ) {
    return 'singapore-sentosa';
  }

  // Default to Nassim (D10)
  return 'singapore-nassim';
}

/**
 * Generate Motor Watch alert using Gemini
 */
export async function generateMotorWatchAlert(
  coeResult: COEResult
): Promise<MotorWatchAlert | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  // Only generate if Cat B drops significantly
  if (coeResult.category !== 'B' || coeResult.change >= -COE_DROP_THRESHOLD) {
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  const dropAmount = Math.abs(coeResult.change).toLocaleString();
  const premium = coeResult.premium.toLocaleString();
  const percentDrop = Math.abs(coeResult.changePercent).toFixed(1);

  const systemPrompt = `${insiderPersona('Singapore', 'Editor')}

Writing Style:
- Tone: 'Knowing Wink' - everyone in Nassim has multiple cars
- COE is the Certificate of Entitlement - a license required to own a car in Singapore
- Cat B is for luxury cars (>1600cc or >130bhp) - Porsches, BMWs, Mercedes
- A $5k+ drop is significant and might trigger buying decisions
- Reference common luxury marques
- No emojis`;

  const prompt = `COE Data:
- Category: B (Luxury Cars >1600cc or >130bhp)
- Current Premium: S$${premium}
- Drop: S$${dropAmount} (${percentDrop}% down from last round)
- Bidding Date: ${coeResult.biddingDate}
- Quota: ${coeResult.quota} | Bids: ${coeResult.bidsReceived}

Task: Write a 40-word Motor Watch alert about the COE price drop.

Return JSON:
{
  "headline": "Motor Watch: COE premiums drop to S$${premium}. (under 60 chars)",
  "body": "40-word alert noting the drop and what it means for luxury car buyers",
  "previewText": "One sentence teaser",
  "link_candidates": [{"text": "exact phrase from body"}]
}`;

  try {
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: { temperature: 0.7 },
    });

    const rawText = response.text || '';

    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from Gemini response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const linkCandidates: LinkCandidate[] = validateLinkCandidates(
      parsed.link_candidates
    );

    let body = parsed.body || `Cat B COE dropped S$${dropAmount} to S$${premium}.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, {
        name: 'Nassim',
        city: 'Singapore',
      });
    }

    return {
      type: 'coe',
      neighborhoodId: 'singapore-nassim',
      headline: parsed.headline || `Motor Watch: COE premiums drop to S$${premium}.`,
      body,
      previewText: parsed.previewText || `Cat B COE down S$${dropAmount}.`,
      coeData: coeResult,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Motor Watch generation error:', error);
    return null;
  }
}

/**
 * Generate GCB Alert using Gemini
 */
export async function generateGCBAlert(
  transaction: GCBTransaction
): Promise<GCBAlert | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  const priceMillions = (transaction.price / 1000000).toFixed(1);
  const psfFormatted = transaction.pricePerSqFt.toLocaleString();
  const landFormatted = transaction.landSize.toLocaleString();

  const systemPrompt = `${insiderPersona('Singapore', 'Editor')}

Writing Style:
- Tone: 'Reverent Awe' - GCBs are Singapore's most exclusive properties
- Good Class Bungalows can only be purchased by Singapore citizens
- Located in 39 gazetted areas, minimum 15,000 sq ft land
- Reference the specific road/area (Nassim, Cluny, etc.)
- Mention if it's Freehold (premium) vs Leasehold
- No emojis`;

  const prompt = `Transaction Data:
- Address: ${transaction.address}
- Area: ${transaction.area}
- District: ${transaction.district}
- Price: S$${priceMillions} million
- Price PSF: S$${psfFormatted}
- Land Size: ${landFormatted} sq ft
- Tenure: ${transaction.tenure}
- Transaction Date: ${transaction.transactionDate}

Task: Write a 45-word GCB Alert about this transaction.

Return JSON:
{
  "headline": "GCB Alert: S$${priceMillions}M transaction recorded in ${transaction.area}.",
  "body": "45-word description of the transaction and its significance",
  "previewText": "One sentence teaser",
  "link_candidates": [{"text": "exact phrase from body"}]
}`;

  try {
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: { temperature: 0.7 },
    });

    const rawText = response.text || '';

    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from Gemini response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const linkCandidates: LinkCandidate[] = validateLinkCandidates(
      parsed.link_candidates
    );

    let body =
      parsed.body || `A S$${priceMillions}M GCB sold in ${transaction.area}.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, {
        name: 'Nassim',
        city: 'Singapore',
      });
    }

    return {
      type: 'gcb',
      neighborhoodId: transaction.neighborhoodId,
      headline:
        parsed.headline ||
        `GCB Alert: S$${priceMillions}M transaction in ${transaction.area}.`,
      body,
      previewText: parsed.previewText || `Major GCB sale in ${transaction.area}.`,
      transaction,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('GCB Alert generation error:', error);
    return null;
  }
}

/**
 * Get all Singapore market alerts
 */
export async function getSingaporeMarketAlerts(): Promise<SingaporeMarketAlert[]> {
  const alerts: SingaporeMarketAlert[] = [];

  // Check COE results
  const coeResults = await fetchCOEResults();
  const catB = coeResults.find((r) => r.category === 'B');

  if (catB && catB.change <= -COE_DROP_THRESHOLD) {
    const motorAlert = await generateMotorWatchAlert(catB);
    if (motorAlert) {
      alerts.push(motorAlert);
      // Also add to Sentosa
      alerts.push({
        ...motorAlert,
        neighborhoodId: 'singapore-sentosa',
      });
    }
  }

  // Check GCB transactions
  const gcbTransactions = await fetchGCBTransactions(30);
  for (const transaction of gcbTransactions.slice(0, 3)) {
    const gcbAlert = await generateGCBAlert(transaction);
    if (gcbAlert) {
      alerts.push(gcbAlert);
    }
    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return alerts;
}

/**
 * Check if COE warrants an alert
 */
export function shouldGenerateCOEAlert(results: COEResult[]): boolean {
  const catB = results.find((r) => r.category === 'B');
  return catB ? catB.change <= -COE_DROP_THRESHOLD : false;
}
