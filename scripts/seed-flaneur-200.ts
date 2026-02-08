/**
 * Seed the Flaneur 200 — target list of global luxury neighborhoods
 *
 * Usage: npx tsx scripts/seed-flaneur-200.ts
 *
 * - Upserts all 200 neighborhoods into the `neighborhoods` table
 * - Existing rows (matched by id) get coordinates/region/country updated
 * - New rows are inserted with is_active = true
 * - Tier classification is NOT stored in DB — see src/config/ad-tiers.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

interface NeighborhoodSeed {
  id: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  region: string;
  latitude: number;
  longitude: number;
  radius: number;
  tier: 'superprime' | 'metropolitan' | 'discovery';
}

// ─── THE FLANEUR 200 ───────────────────────────────────────────────
// tier field is used to update ad-tiers.ts, not stored in DB

const FLANEUR_200: NeighborhoodSeed[] = [
  // ═══════════════════════════════════════════════════════════════════
  // NORTH AMERICA (EAST)
  // ═══════════════════════════════════════════════════════════════════

  // New York City
  { id: 'nyc-tribeca', name: 'Tribeca', city: 'New York', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 40.7163, longitude: -74.0086, radius: 800, tier: 'superprime' },
  { id: 'nyc-upper-east-side', name: 'Upper East Side', city: 'New York', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 40.7736, longitude: -73.9566, radius: 1200, tier: 'superprime' },
  { id: 'nyc-soho', name: 'SoHo', city: 'New York', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 40.7233, longitude: -74.0030, radius: 700, tier: 'superprime' },
  { id: 'nyc-west-village', name: 'West Village', city: 'New York', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 40.7336, longitude: -74.0027, radius: 800, tier: 'superprime' },
  { id: 'nyc-dumbo', name: 'DUMBO', city: 'New York', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 40.7033, longitude: -73.9883, radius: 600, tier: 'superprime' },
  { id: 'nyc-brooklyn-heights', name: 'Brooklyn Heights', city: 'New York', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 40.6960, longitude: -73.9936, radius: 800, tier: 'superprime' },
  { id: 'nyc-williamsburg', name: 'Williamsburg', city: 'New York', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 40.7081, longitude: -73.9571, radius: 1000, tier: 'metropolitan' },
  { id: 'nyc-greenwich-village', name: 'Greenwich Village', city: 'New York', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 40.7336, longitude: -73.9996, radius: 800, tier: 'superprime' },
  { id: 'nyc-chelsea', name: 'Chelsea', city: 'New York', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 40.7465, longitude: -74.0014, radius: 900, tier: 'superprime' },
  { id: 'nyc-nolita', name: 'Nolita', city: 'New York', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 40.7234, longitude: -73.9955, radius: 500, tier: 'metropolitan' },

  // The Hamptons
  { id: 'hamptons-sagaponack', name: 'Hamptons (Sagaponack)', city: 'The Hamptons', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 40.9243, longitude: -72.2682, radius: 3000, tier: 'superprime' },
  { id: 'hamptons-east-hampton', name: 'East Hampton', city: 'The Hamptons', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 40.9634, longitude: -72.1848, radius: 3000, tier: 'superprime' },
  { id: 'hamptons-montauk', name: 'Montauk', city: 'The Hamptons', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 41.0359, longitude: -71.9545, radius: 3000, tier: 'metropolitan' },

  // Connecticut / NY Suburbs
  { id: 'ct-greenwich', name: 'Greenwich', city: 'Connecticut', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 41.0262, longitude: -73.6282, radius: 3000, tier: 'superprime' },
  { id: 'nyc-scarsdale', name: 'Scarsdale', city: 'New York', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 40.9888, longitude: -73.7846, radius: 2000, tier: 'metropolitan' },

  // Boston
  { id: 'boston-beacon-hill', name: 'Beacon Hill', city: 'Boston', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 42.3588, longitude: -71.0707, radius: 700, tier: 'superprime' },
  { id: 'boston-back-bay', name: 'Back Bay', city: 'Boston', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 42.3503, longitude: -71.0810, radius: 900, tier: 'metropolitan' },
  { id: 'boston-seaport', name: 'Seaport', city: 'Boston', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 42.3467, longitude: -71.0427, radius: 1000, tier: 'metropolitan' },

  // Washington DC
  { id: 'dc-georgetown', name: 'Georgetown', city: 'Washington DC', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 38.9076, longitude: -77.0723, radius: 1200, tier: 'superprime' },
  { id: 'dc-kalorama', name: 'Kalorama', city: 'Washington DC', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 38.9215, longitude: -77.0550, radius: 700, tier: 'metropolitan' },

  // Florida
  { id: 'palm-beach-island', name: 'Palm Beach', city: 'Florida', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 26.7056, longitude: -80.0364, radius: 3000, tier: 'superprime' },

  // Miami
  { id: 'miami-brickell', name: 'Brickell', city: 'Miami', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 25.7617, longitude: -80.1918, radius: 1000, tier: 'superprime' },
  { id: 'miami-coconut-grove', name: 'Coconut Grove', city: 'Miami', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 25.7270, longitude: -80.2414, radius: 1200, tier: 'metropolitan' },
  { id: 'miami-design-district', name: 'Design District', city: 'Miami', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 25.8133, longitude: -80.1926, radius: 800, tier: 'metropolitan' },
  { id: 'miami-south-beach', name: 'South Beach', city: 'Miami', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 25.7825, longitude: -80.1340, radius: 1500, tier: 'metropolitan' },
  { id: 'miami-wynwood', name: 'Wynwood', city: 'Miami', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 25.8009, longitude: -80.1994, radius: 800, tier: 'discovery' },
  { id: 'miami-coral-gables', name: 'Coral Gables', city: 'Miami', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 25.7215, longitude: -80.2684, radius: 1500, tier: 'metropolitan' },

  // Atlanta
  { id: 'atlanta-buckhead', name: 'Buckhead', city: 'Atlanta', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 33.8384, longitude: -84.3794, radius: 2000, tier: 'metropolitan' },

  // Philadelphia
  { id: 'philly-rittenhouse', name: 'Rittenhouse Square', city: 'Philadelphia', country: 'USA', timezone: 'America/New_York', region: 'north-america', latitude: 39.9496, longitude: -75.1719, radius: 800, tier: 'metropolitan' },

  // Toronto
  { id: 'toronto-yorkville', name: 'Yorkville', city: 'Toronto', country: 'Canada', timezone: 'America/Toronto', region: 'north-america', latitude: 43.6708, longitude: -79.3935, radius: 900, tier: 'superprime' },
  { id: 'toronto-rosedale', name: 'Rosedale', city: 'Toronto', country: 'Canada', timezone: 'America/Toronto', region: 'north-america', latitude: 43.6797, longitude: -79.3768, radius: 1200, tier: 'metropolitan' },

  // Montreal
  { id: 'montreal-westmount', name: 'Westmount', city: 'Montreal', country: 'Canada', timezone: 'America/Montreal', region: 'north-america', latitude: 45.4833, longitude: -73.5966, radius: 1500, tier: 'metropolitan' },

  // ═══════════════════════════════════════════════════════════════════
  // NORTH AMERICA (CENTRAL/WEST)
  // ═══════════════════════════════════════════════════════════════════

  // Los Angeles
  { id: 'la-beverly-hills', name: 'Beverly Hills', city: 'Los Angeles', country: 'USA', timezone: 'America/Los_Angeles', region: 'north-america', latitude: 34.0736, longitude: -118.4004, radius: 1500, tier: 'superprime' },
  { id: 'la-bel-air', name: 'Bel Air', city: 'Los Angeles', country: 'USA', timezone: 'America/Los_Angeles', region: 'north-america', latitude: 34.0834, longitude: -118.4590, radius: 2000, tier: 'superprime' },
  { id: 'la-malibu', name: 'Malibu', city: 'Los Angeles', country: 'USA', timezone: 'America/Los_Angeles', region: 'north-america', latitude: 34.0259, longitude: -118.7798, radius: 5000, tier: 'superprime' },
  { id: 'la-venice', name: 'Venice Beach', city: 'Los Angeles', country: 'USA', timezone: 'America/Los_Angeles', region: 'north-america', latitude: 33.9850, longitude: -118.4695, radius: 1200, tier: 'metropolitan' },
  { id: 'la-silver-lake', name: 'Silver Lake', city: 'Los Angeles', country: 'USA', timezone: 'America/Los_Angeles', region: 'north-america', latitude: 34.0869, longitude: -118.2702, radius: 1000, tier: 'discovery' },
  { id: 'la-west-hollywood', name: 'West Hollywood', city: 'Los Angeles', country: 'USA', timezone: 'America/Los_Angeles', region: 'north-america', latitude: 34.0900, longitude: -118.3617, radius: 1200, tier: 'metropolitan' },
  { id: 'la-santa-monica', name: 'Santa Monica', city: 'Los Angeles', country: 'USA', timezone: 'America/Los_Angeles', region: 'north-america', latitude: 34.0195, longitude: -118.4912, radius: 1500, tier: 'metropolitan' },

  // San Francisco
  { id: 'sf-pacific-heights', name: 'Pacific Heights', city: 'San Francisco', country: 'USA', timezone: 'America/Los_Angeles', region: 'north-america', latitude: 37.7925, longitude: -122.4350, radius: 1000, tier: 'superprime' },
  { id: 'sf-marina', name: 'Marina District', city: 'San Francisco', country: 'USA', timezone: 'America/Los_Angeles', region: 'north-america', latitude: 37.8037, longitude: -122.4368, radius: 1000, tier: 'metropolitan' },

  // California (Peninsula)
  { id: 'ca-palo-alto', name: 'Palo Alto', city: 'California', country: 'USA', timezone: 'America/Los_Angeles', region: 'north-america', latitude: 37.4419, longitude: -122.1430, radius: 3000, tier: 'superprime' },
  { id: 'ca-atherton', name: 'Atherton', city: 'California', country: 'USA', timezone: 'America/Los_Angeles', region: 'north-america', latitude: 37.4613, longitude: -122.1978, radius: 2500, tier: 'superprime' },

  // Santa Barbara
  { id: 'santabarbara-montecito', name: 'Montecito', city: 'Santa Barbara', country: 'USA', timezone: 'America/Los_Angeles', region: 'north-america', latitude: 34.4352, longitude: -119.6320, radius: 3000, tier: 'superprime' },

  // Vancouver
  { id: 'vancouver-west-vancouver', name: 'West Vancouver', city: 'Vancouver', country: 'Canada', timezone: 'America/Vancouver', region: 'north-america', latitude: 49.3280, longitude: -123.1598, radius: 3000, tier: 'superprime' },
  { id: 'vancouver-kitsilano', name: 'Kitsilano', city: 'Vancouver', country: 'Canada', timezone: 'America/Vancouver', region: 'north-america', latitude: 49.2667, longitude: -123.1594, radius: 1500, tier: 'metropolitan' },

  // Chicago
  { id: 'chicago-gold-coast', name: 'Gold Coast', city: 'Chicago', country: 'USA', timezone: 'America/Chicago', region: 'north-america', latitude: 41.9044, longitude: -87.6278, radius: 800, tier: 'metropolitan' },
  { id: 'chicago-lincoln-park', name: 'Lincoln Park', city: 'Chicago', country: 'USA', timezone: 'America/Chicago', region: 'north-america', latitude: 41.9214, longitude: -87.6513, radius: 1500, tier: 'metropolitan' },
  { id: 'chicago-fulton-market', name: 'Fulton Market', city: 'Chicago', country: 'USA', timezone: 'America/Chicago', region: 'north-america', latitude: 41.8863, longitude: -87.6526, radius: 800, tier: 'discovery' },

  // Dallas
  { id: 'dallas-highland-park', name: 'Highland Park', city: 'Dallas', country: 'USA', timezone: 'America/Chicago', region: 'north-america', latitude: 32.8335, longitude: -96.7920, radius: 2000, tier: 'metropolitan' },

  // Houston
  { id: 'houston-river-oaks', name: 'River Oaks', city: 'Houston', country: 'USA', timezone: 'America/Chicago', region: 'north-america', latitude: 29.7505, longitude: -95.4204, radius: 2000, tier: 'metropolitan' },

  // Austin
  { id: 'austin-downtown', name: 'Downtown Austin', city: 'Austin', country: 'USA', timezone: 'America/Chicago', region: 'north-america', latitude: 30.2672, longitude: -97.7431, radius: 1500, tier: 'discovery' },
  { id: 'austin-south-congress', name: 'South Congress', city: 'Austin', country: 'USA', timezone: 'America/Chicago', region: 'north-america', latitude: 30.2487, longitude: -97.7497, radius: 1200, tier: 'discovery' },

  // Colorado
  { id: 'co-aspen', name: 'Aspen', city: 'Colorado', country: 'USA', timezone: 'America/Denver', region: 'north-america', latitude: 39.1911, longitude: -106.8175, radius: 3000, tier: 'superprime' },
  { id: 'co-vail', name: 'Vail', city: 'Colorado', country: 'USA', timezone: 'America/Denver', region: 'north-america', latitude: 39.6403, longitude: -106.3742, radius: 3000, tier: 'metropolitan' },

  // Wyoming
  { id: 'wy-jackson-hole', name: 'Jackson Hole', city: 'Wyoming', country: 'USA', timezone: 'America/Denver', region: 'north-america', latitude: 43.4799, longitude: -110.7624, radius: 5000, tier: 'superprime' },

  // Denver
  { id: 'denver-cherry-creek', name: 'Cherry Creek', city: 'Denver', country: 'USA', timezone: 'America/Denver', region: 'north-america', latitude: 39.7174, longitude: -104.9534, radius: 1500, tier: 'metropolitan' },

  // Seattle
  { id: 'seattle-south-lake-union', name: 'South Lake Union', city: 'Seattle', country: 'USA', timezone: 'America/Los_Angeles', region: 'north-america', latitude: 47.6268, longitude: -122.3388, radius: 1000, tier: 'metropolitan' },

  // Mexico City
  { id: 'cdmx-polanco', name: 'Polanco', city: 'Mexico City', country: 'Mexico', timezone: 'America/Mexico_City', region: 'north-america', latitude: 19.4333, longitude: -99.1947, radius: 1200, tier: 'metropolitan' },
  { id: 'cdmx-lomas', name: 'Lomas de Chapultepec', city: 'Mexico City', country: 'Mexico', timezone: 'America/Mexico_City', region: 'north-america', latitude: 19.4184, longitude: -99.2263, radius: 1500, tier: 'superprime' },
  { id: 'cdmx-roma-norte', name: 'Roma Norte', city: 'Mexico City', country: 'Mexico', timezone: 'America/Mexico_City', region: 'north-america', latitude: 19.4194, longitude: -99.1612, radius: 1000, tier: 'discovery' },
  { id: 'cdmx-condesa', name: 'Condesa', city: 'Mexico City', country: 'Mexico', timezone: 'America/Mexico_City', region: 'north-america', latitude: 19.4117, longitude: -99.1733, radius: 1000, tier: 'discovery' },

  // ═══════════════════════════════════════════════════════════════════
  // EUROPE (UK & IRELAND)
  // ═══════════════════════════════════════════════════════════════════

  { id: 'london-mayfair', name: 'Mayfair', city: 'London', country: 'UK', timezone: 'Europe/London', region: 'europe', latitude: 51.5099, longitude: -0.1478, radius: 900, tier: 'superprime' },
  { id: 'london-kensington', name: 'Kensington', city: 'London', country: 'UK', timezone: 'Europe/London', region: 'europe', latitude: 51.4990, longitude: -0.1939, radius: 1200, tier: 'superprime' },
  { id: 'london-chelsea', name: 'Chelsea', city: 'London', country: 'UK', timezone: 'Europe/London', region: 'europe', latitude: 51.4875, longitude: -0.1687, radius: 1200, tier: 'superprime' },
  { id: 'london-notting-hill', name: 'Notting Hill', city: 'London', country: 'UK', timezone: 'Europe/London', region: 'europe', latitude: 51.5117, longitude: -0.2054, radius: 1000, tier: 'superprime' },
  { id: 'london-belgravia', name: 'Belgravia', city: 'London', country: 'UK', timezone: 'Europe/London', region: 'europe', latitude: 51.4985, longitude: -0.1527, radius: 800, tier: 'superprime' },
  { id: 'london-knightsbridge', name: 'Knightsbridge', city: 'London', country: 'UK', timezone: 'Europe/London', region: 'europe', latitude: 51.4994, longitude: -0.1640, radius: 700, tier: 'superprime' },
  { id: 'london-marylebone', name: 'Marylebone', city: 'London', country: 'UK', timezone: 'Europe/London', region: 'europe', latitude: 51.5203, longitude: -0.1537, radius: 900, tier: 'metropolitan' },
  { id: 'london-hampstead', name: 'Hampstead', city: 'London', country: 'UK', timezone: 'Europe/London', region: 'europe', latitude: 51.5557, longitude: -0.1780, radius: 1200, tier: 'metropolitan' },
  { id: 'london-shoreditch', name: 'Shoreditch', city: 'London', country: 'UK', timezone: 'Europe/London', region: 'europe', latitude: 51.5263, longitude: -0.0795, radius: 900, tier: 'metropolitan' },
  { id: 'london-primrose-hill', name: 'Primrose Hill', city: 'London', country: 'UK', timezone: 'Europe/London', region: 'europe', latitude: 51.5397, longitude: -0.1615, radius: 700, tier: 'metropolitan' },
  { id: 'london-st-johns-wood', name: "St John's Wood", city: 'London', country: 'UK', timezone: 'Europe/London', region: 'europe', latitude: 51.5342, longitude: -0.1753, radius: 1000, tier: 'metropolitan' },
  { id: 'london-holland-park', name: 'Holland Park', city: 'London', country: 'UK', timezone: 'Europe/London', region: 'europe', latitude: 51.5029, longitude: -0.2068, radius: 900, tier: 'superprime' },
  { id: 'london-soho', name: 'Soho', city: 'London', country: 'UK', timezone: 'Europe/London', region: 'europe', latitude: 51.5137, longitude: -0.1337, radius: 700, tier: 'metropolitan' },
  { id: 'london-clerkenwell', name: 'Clerkenwell', city: 'London', country: 'UK', timezone: 'Europe/London', region: 'europe', latitude: 51.5244, longitude: -0.1046, radius: 800, tier: 'discovery' },

  // Dublin
  { id: 'dublin-ballsbridge', name: 'Ballsbridge', city: 'Dublin', country: 'Ireland', timezone: 'Europe/Dublin', region: 'europe', latitude: 53.3285, longitude: -6.2280, radius: 1000, tier: 'metropolitan' },

  // ═══════════════════════════════════════════════════════════════════
  // EUROPE (WESTERN/NORTHERN)
  // ═══════════════════════════════════════════════════════════════════

  // Paris
  { id: 'paris-1st', name: '1st Arrondissement', city: 'Paris', country: 'France', timezone: 'Europe/Paris', region: 'europe', latitude: 48.8606, longitude: 2.3376, radius: 1000, tier: 'superprime' },
  { id: 'paris-8th', name: '8th Arrondissement', city: 'Paris', country: 'France', timezone: 'Europe/Paris', region: 'europe', latitude: 48.8744, longitude: 2.3106, radius: 1200, tier: 'superprime' },
  { id: 'paris-16th', name: '16th Arrondissement', city: 'Paris', country: 'France', timezone: 'Europe/Paris', region: 'europe', latitude: 48.8637, longitude: 2.2769, radius: 1500, tier: 'superprime' },
  { id: 'paris-le-marais', name: 'Le Marais', city: 'Paris', country: 'France', timezone: 'Europe/Paris', region: 'europe', latitude: 48.8566, longitude: 2.3622, radius: 900, tier: 'metropolitan' },
  { id: 'paris-saint-germain', name: 'Saint-Germain-des-Prés', city: 'Paris', country: 'France', timezone: 'Europe/Paris', region: 'europe', latitude: 48.8539, longitude: 2.3338, radius: 900, tier: 'superprime' },
  { id: 'paris-montmartre', name: 'Montmartre', city: 'Paris', country: 'France', timezone: 'Europe/Paris', region: 'europe', latitude: 48.8867, longitude: 2.3431, radius: 1000, tier: 'discovery' },
  { id: 'paris-canal-st-martin', name: 'Canal Saint-Martin', city: 'Paris', country: 'France', timezone: 'Europe/Paris', region: 'europe', latitude: 48.8709, longitude: 2.3650, radius: 800, tier: 'discovery' },

  // French Riviera & Alps
  { id: 'nice-cap-ferrat', name: 'Cap Ferrat', city: 'Nice', country: 'France', timezone: 'Europe/Paris', region: 'europe', latitude: 43.6833, longitude: 7.3333, radius: 2000, tier: 'superprime' },
  { id: 'riviera-antibes', name: 'Antibes', city: 'French Riviera', country: 'France', timezone: 'Europe/Paris', region: 'europe', latitude: 43.5804, longitude: 7.1251, radius: 2500, tier: 'superprime' },
  { id: 'riviera-cannes', name: 'Cannes', city: 'French Riviera', country: 'France', timezone: 'Europe/Paris', region: 'europe', latitude: 43.5528, longitude: 7.0174, radius: 2500, tier: 'superprime' },

  // Monaco
  { id: 'monaco-monaco', name: 'Monaco', city: 'Monaco', country: 'Monaco', timezone: 'Europe/Monaco', region: 'europe', latitude: 43.7384, longitude: 7.4246, radius: 1500, tier: 'superprime' },

  // French Alps
  { id: 'alps-courchevel', name: 'Courchevel 1850', city: 'Alps', country: 'France', timezone: 'Europe/Paris', region: 'europe', latitude: 45.4147, longitude: 6.6347, radius: 3000, tier: 'superprime' },

  // Berlin
  { id: 'berlin-mitte', name: 'Mitte', city: 'Berlin', country: 'Germany', timezone: 'Europe/Berlin', region: 'europe', latitude: 52.5200, longitude: 13.4050, radius: 1200, tier: 'metropolitan' },
  { id: 'berlin-charlottenburg', name: 'Charlottenburg', city: 'Berlin', country: 'Germany', timezone: 'Europe/Berlin', region: 'europe', latitude: 52.5163, longitude: 13.3040, radius: 1500, tier: 'metropolitan' },
  { id: 'berlin-prenzlauer-berg', name: 'Prenzlauer Berg', city: 'Berlin', country: 'Germany', timezone: 'Europe/Berlin', region: 'europe', latitude: 52.5387, longitude: 13.4244, radius: 1200, tier: 'metropolitan' },
  { id: 'berlin-kreuzberg', name: 'Kreuzberg', city: 'Berlin', country: 'Germany', timezone: 'Europe/Berlin', region: 'europe', latitude: 52.4934, longitude: 13.4234, radius: 1200, tier: 'discovery' },
  { id: 'berlin-grunewald', name: 'Grunewald', city: 'Berlin', country: 'Germany', timezone: 'Europe/Berlin', region: 'europe', latitude: 52.4833, longitude: 13.2667, radius: 1500, tier: 'metropolitan' },

  // Munich
  { id: 'munich-bogenhausen', name: 'Bogenhausen', city: 'Munich', country: 'Germany', timezone: 'Europe/Berlin', region: 'europe', latitude: 48.1517, longitude: 11.6097, radius: 1500, tier: 'metropolitan' },
  { id: 'munich-schwabing', name: 'Schwabing', city: 'Munich', country: 'Germany', timezone: 'Europe/Berlin', region: 'europe', latitude: 48.1622, longitude: 11.5755, radius: 1200, tier: 'metropolitan' },

  // Hamburg
  { id: 'hamburg-harvestehude', name: 'Harvestehude', city: 'Hamburg', country: 'Germany', timezone: 'Europe/Berlin', region: 'europe', latitude: 53.5775, longitude: 9.9873, radius: 1200, tier: 'metropolitan' },

  // Stockholm
  { id: 'stockholm-ostermalm', name: 'Östermalm', city: 'Stockholm', country: 'Sweden', timezone: 'Europe/Stockholm', region: 'europe', latitude: 59.3380, longitude: 18.0850, radius: 1200, tier: 'metropolitan' },
  { id: 'stockholm-sodermalm', name: 'Södermalm', city: 'Stockholm', country: 'Sweden', timezone: 'Europe/Stockholm', region: 'europe', latitude: 59.3150, longitude: 18.0710, radius: 1500, tier: 'discovery' },
  { id: 'stockholm-djurgarden', name: 'Djurgården', city: 'Stockholm', country: 'Sweden', timezone: 'Europe/Stockholm', region: 'europe', latitude: 59.3260, longitude: 18.1100, radius: 1500, tier: 'metropolitan' },
  { id: 'stockholm-vasastan', name: 'Vasastan', city: 'Stockholm', country: 'Sweden', timezone: 'Europe/Stockholm', region: 'europe', latitude: 59.3447, longitude: 18.0490, radius: 1000, tier: 'metropolitan' },

  // Oslo
  { id: 'oslo-grunerløkka', name: 'Grünerløkka', city: 'Oslo', country: 'Norway', timezone: 'Europe/Oslo', region: 'europe', latitude: 59.9225, longitude: 10.7607, radius: 1000, tier: 'discovery' },
  { id: 'oslo-frogner', name: 'Frogner', city: 'Oslo', country: 'Norway', timezone: 'Europe/Oslo', region: 'europe', latitude: 59.9209, longitude: 10.7085, radius: 1200, tier: 'metropolitan' },

  // Copenhagen
  { id: 'copenhagen-frederiksberg', name: 'Frederiksberg', city: 'Copenhagen', country: 'Denmark', timezone: 'Europe/Copenhagen', region: 'europe', latitude: 55.6802, longitude: 12.5318, radius: 1500, tier: 'metropolitan' },
  { id: 'copenhagen-christianshavn', name: 'Christianshavn', city: 'Copenhagen', country: 'Denmark', timezone: 'Europe/Copenhagen', region: 'europe', latitude: 55.6720, longitude: 12.5930, radius: 800, tier: 'discovery' },

  // Amsterdam
  { id: 'amsterdam-oud-zuid', name: 'Oud-Zuid', city: 'Amsterdam', country: 'Netherlands', timezone: 'Europe/Amsterdam', region: 'europe', latitude: 52.3500, longitude: 4.8700, radius: 1200, tier: 'metropolitan' },
  { id: 'amsterdam-de-pijp', name: 'De Pijp', city: 'Amsterdam', country: 'Netherlands', timezone: 'Europe/Amsterdam', region: 'europe', latitude: 52.3522, longitude: 4.8937, radius: 900, tier: 'metropolitan' },
  { id: 'amsterdam-grachtengordel', name: 'Grachtengordel', city: 'Amsterdam', country: 'Netherlands', timezone: 'Europe/Amsterdam', region: 'europe', latitude: 52.3667, longitude: 4.8833, radius: 1000, tier: 'superprime' },

  // Brussels
  { id: 'brussels-ixelles', name: 'Ixelles', city: 'Brussels', country: 'Belgium', timezone: 'Europe/Brussels', region: 'europe', latitude: 50.8270, longitude: 4.3701, radius: 1200, tier: 'metropolitan' },

  // Zurich
  { id: 'zurich-zurichberg', name: 'Zürichberg', city: 'Zurich', country: 'Switzerland', timezone: 'Europe/Zurich', region: 'europe', latitude: 47.3833, longitude: 8.5650, radius: 1500, tier: 'superprime' },
  { id: 'zurich-seefeld', name: 'Seefeld', city: 'Zurich', country: 'Switzerland', timezone: 'Europe/Zurich', region: 'europe', latitude: 47.3564, longitude: 8.5540, radius: 1000, tier: 'metropolitan' },

  // Geneva
  { id: 'geneva-cologny', name: 'Cologny', city: 'Geneva', country: 'Switzerland', timezone: 'Europe/Zurich', region: 'europe', latitude: 46.2178, longitude: 6.1836, radius: 1500, tier: 'superprime' },
  { id: 'geneva-eaux-vives', name: 'Eaux-Vives', city: 'Geneva', country: 'Switzerland', timezone: 'Europe/Zurich', region: 'europe', latitude: 46.2006, longitude: 6.1614, radius: 1000, tier: 'metropolitan' },

  // Swiss Alps
  { id: 'swissalps-st-moritz', name: 'St. Moritz', city: 'Swiss Alps', country: 'Switzerland', timezone: 'Europe/Zurich', region: 'europe', latitude: 46.4908, longitude: 9.8355, radius: 3000, tier: 'superprime' },
  { id: 'swissalps-gstaad', name: 'Gstaad', city: 'Swiss Alps', country: 'Switzerland', timezone: 'Europe/Zurich', region: 'europe', latitude: 46.4748, longitude: 7.2862, radius: 3000, tier: 'superprime' },

  // ═══════════════════════════════════════════════════════════════════
  // EUROPE (SOUTHERN)
  // ═══════════════════════════════════════════════════════════════════

  // Milan
  { id: 'milan-brera', name: 'Brera', city: 'Milan', country: 'Italy', timezone: 'Europe/Rome', region: 'europe', latitude: 45.4722, longitude: 9.1867, radius: 800, tier: 'superprime' },
  { id: 'milan-porta-nuova', name: 'Porta Nuova', city: 'Milan', country: 'Italy', timezone: 'Europe/Rome', region: 'europe', latitude: 45.4833, longitude: 9.1900, radius: 900, tier: 'metropolitan' },
  { id: 'milan-quadrilatero', name: 'Quadrilatero della Moda', city: 'Milan', country: 'Italy', timezone: 'Europe/Rome', region: 'europe', latitude: 45.4688, longitude: 9.1942, radius: 500, tier: 'superprime' },

  // Rome
  { id: 'rome-parioli', name: 'Parioli', city: 'Rome', country: 'Italy', timezone: 'Europe/Rome', region: 'europe', latitude: 41.9256, longitude: 12.4917, radius: 1200, tier: 'metropolitan' },
  { id: 'rome-trastevere', name: 'Trastevere', city: 'Rome', country: 'Italy', timezone: 'Europe/Rome', region: 'europe', latitude: 41.8893, longitude: 12.4696, radius: 1000, tier: 'discovery' },
  { id: 'rome-centro-storico', name: 'Centro Storico', city: 'Rome', country: 'Italy', timezone: 'Europe/Rome', region: 'europe', latitude: 41.8986, longitude: 12.4769, radius: 1200, tier: 'metropolitan' },

  // Italian Riviera / Lakes / Islands
  { id: 'lombardy-lake-como', name: 'Lake Como', city: 'Lombardy', country: 'Italy', timezone: 'Europe/Rome', region: 'europe', latitude: 45.9870, longitude: 9.2570, radius: 5000, tier: 'superprime' },
  { id: 'liguria-portofino', name: 'Portofino', city: 'Liguria', country: 'Italy', timezone: 'Europe/Rome', region: 'europe', latitude: 44.3035, longitude: 9.2097, radius: 2000, tier: 'superprime' },
  { id: 'campania-capri', name: 'Capri', city: 'Campania', country: 'Italy', timezone: 'Europe/Rome', region: 'europe', latitude: 40.5507, longitude: 14.2224, radius: 3000, tier: 'superprime' },

  // Madrid
  { id: 'madrid-salamanca', name: 'Salamanca', city: 'Madrid', country: 'Spain', timezone: 'Europe/Madrid', region: 'europe', latitude: 40.4276, longitude: -3.6803, radius: 1200, tier: 'superprime' },
  { id: 'madrid-chamberi', name: 'Chamberí', city: 'Madrid', country: 'Spain', timezone: 'Europe/Madrid', region: 'europe', latitude: 40.4339, longitude: -3.7008, radius: 1000, tier: 'metropolitan' },
  { id: 'madrid-justicia', name: 'Justicia', city: 'Madrid', country: 'Spain', timezone: 'Europe/Madrid', region: 'europe', latitude: 40.4241, longitude: -3.6979, radius: 700, tier: 'metropolitan' },

  // Barcelona
  { id: 'barcelona-eixample', name: 'Eixample', city: 'Barcelona', country: 'Spain', timezone: 'Europe/Madrid', region: 'europe', latitude: 41.3917, longitude: 2.1649, radius: 1500, tier: 'metropolitan' },
  { id: 'barcelona-pedralbes', name: 'Pedralbes', city: 'Barcelona', country: 'Spain', timezone: 'Europe/Madrid', region: 'europe', latitude: 41.3886, longitude: 2.1100, radius: 1500, tier: 'superprime' },
  { id: 'barcelona-gracia', name: 'Gràcia', city: 'Barcelona', country: 'Spain', timezone: 'Europe/Madrid', region: 'europe', latitude: 41.4036, longitude: 2.1567, radius: 1000, tier: 'discovery' },
  { id: 'barcelona-el-born', name: 'El Born', city: 'Barcelona', country: 'Spain', timezone: 'Europe/Madrid', region: 'europe', latitude: 41.3851, longitude: 2.1834, radius: 700, tier: 'discovery' },

  // Ibiza & Coastal Spain
  { id: 'ibiza-town', name: 'Ibiza Town', city: 'Ibiza', country: 'Spain', timezone: 'Europe/Madrid', region: 'europe', latitude: 38.9067, longitude: 1.4206, radius: 2000, tier: 'superprime' },
  { id: 'marbella-golden-mile', name: 'Marbella (Golden Mile)', city: 'Marbella', country: 'Spain', timezone: 'Europe/Madrid', region: 'europe', latitude: 36.5098, longitude: -4.8862, radius: 3000, tier: 'superprime' },
  { id: 'andalusia-sotogrande', name: 'Sotogrande', city: 'Andalusia', country: 'Spain', timezone: 'Europe/Madrid', region: 'europe', latitude: 36.2869, longitude: -5.2839, radius: 3000, tier: 'metropolitan' },

  // Lisbon & Portugal
  { id: 'lisbon-principe-real', name: 'Príncipe Real', city: 'Lisbon', country: 'Portugal', timezone: 'Europe/Lisbon', region: 'europe', latitude: 38.7178, longitude: -9.1489, radius: 600, tier: 'metropolitan' },
  { id: 'lisbon-chiado', name: 'Chiado', city: 'Lisbon', country: 'Portugal', timezone: 'Europe/Lisbon', region: 'europe', latitude: 38.7103, longitude: -9.1426, radius: 700, tier: 'metropolitan' },
  { id: 'lisbon-alfama', name: 'Alfama', city: 'Lisbon', country: 'Portugal', timezone: 'Europe/Lisbon', region: 'europe', latitude: 38.7118, longitude: -9.1281, radius: 800, tier: 'discovery' },
  { id: 'lisbon-cascais', name: 'Cascais', city: 'Lisbon', country: 'Portugal', timezone: 'Europe/Lisbon', region: 'europe', latitude: 38.6970, longitude: -9.4215, radius: 2000, tier: 'metropolitan' },
  { id: 'alentejo-comporta', name: 'Comporta', city: 'Alentejo', country: 'Portugal', timezone: 'Europe/Lisbon', region: 'europe', latitude: 38.3833, longitude: -8.7833, radius: 5000, tier: 'superprime' },

  // Greece
  { id: 'athens-kolonaki', name: 'Kolonaki', city: 'Athens', country: 'Greece', timezone: 'Europe/Athens', region: 'europe', latitude: 37.9780, longitude: 23.7412, radius: 800, tier: 'metropolitan' },
  { id: 'athens-vouliagmeni', name: 'Vouliagmeni', city: 'Athens', country: 'Greece', timezone: 'Europe/Athens', region: 'europe', latitude: 37.8100, longitude: 23.7700, radius: 2000, tier: 'superprime' },
  { id: 'mykonos-town', name: 'Mykonos Town', city: 'Mykonos', country: 'Greece', timezone: 'Europe/Athens', region: 'europe', latitude: 37.4467, longitude: 25.3289, radius: 2000, tier: 'superprime' },

  // ═══════════════════════════════════════════════════════════════════
  // ASIA PACIFIC
  // ═══════════════════════════════════════════════════════════════════

  // Tokyo
  { id: 'tokyo-minato', name: 'Minato-ku', city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo', region: 'asia-pacific', latitude: 35.6581, longitude: 139.7514, radius: 1500, tier: 'superprime' },
  { id: 'tokyo-ginza', name: 'Ginza', city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo', region: 'asia-pacific', latitude: 35.6717, longitude: 139.7649, radius: 1000, tier: 'superprime' },
  { id: 'tokyo-aoyama', name: 'Aoyama', city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo', region: 'asia-pacific', latitude: 35.6690, longitude: 139.7188, radius: 900, tier: 'superprime' },
  { id: 'tokyo-daikanyama', name: 'Daikanyama', city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo', region: 'asia-pacific', latitude: 35.6489, longitude: 139.7033, radius: 700, tier: 'metropolitan' },
  { id: 'tokyo-roppongi', name: 'Roppongi', city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo', region: 'asia-pacific', latitude: 35.6628, longitude: 139.7315, radius: 1000, tier: 'metropolitan' },
  { id: 'tokyo-shibuya', name: 'Shibuya', city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo', region: 'asia-pacific', latitude: 35.6580, longitude: 139.7016, radius: 1200, tier: 'discovery' },

  // Hokkaido
  { id: 'hokkaido-niseko', name: 'Niseko', city: 'Hokkaido', country: 'Japan', timezone: 'Asia/Tokyo', region: 'asia-pacific', latitude: 42.8604, longitude: 140.6874, radius: 5000, tier: 'discovery' },

  // Hong Kong
  { id: 'hk-the-peak', name: 'The Peak', city: 'Hong Kong', country: 'Hong Kong', timezone: 'Asia/Hong_Kong', region: 'asia-pacific', latitude: 22.2759, longitude: 114.1455, radius: 1200, tier: 'superprime' },
  { id: 'hk-mid-levels', name: 'Mid-Levels', city: 'Hong Kong', country: 'Hong Kong', timezone: 'Asia/Hong_Kong', region: 'asia-pacific', latitude: 22.2800, longitude: 114.1520, radius: 1000, tier: 'superprime' },
  { id: 'hk-repulse-bay', name: 'Repulse Bay', city: 'Hong Kong', country: 'Hong Kong', timezone: 'Asia/Hong_Kong', region: 'asia-pacific', latitude: 22.2370, longitude: 114.1960, radius: 1500, tier: 'superprime' },

  // Singapore
  { id: 'singapore-nassim', name: 'Nassim Hill', city: 'Singapore', country: 'Singapore', timezone: 'Asia/Singapore', region: 'asia-pacific', latitude: 1.3060, longitude: 103.8230, radius: 1000, tier: 'superprime' },
  { id: 'singapore-tanglin', name: 'Tanglin', city: 'Singapore', country: 'Singapore', timezone: 'Asia/Singapore', region: 'asia-pacific', latitude: 1.3010, longitude: 103.8190, radius: 1200, tier: 'superprime' },
  { id: 'singapore-sentosa', name: 'Sentosa Cove', city: 'Singapore', country: 'Singapore', timezone: 'Asia/Singapore', region: 'asia-pacific', latitude: 1.2500, longitude: 103.8380, radius: 1500, tier: 'superprime' },
  { id: 'singapore-orchard', name: 'Orchard Road', city: 'Singapore', country: 'Singapore', timezone: 'Asia/Singapore', region: 'asia-pacific', latitude: 1.3048, longitude: 103.8318, radius: 1200, tier: 'metropolitan' },

  // Seoul
  { id: 'seoul-gangnam', name: 'Gangnam', city: 'Seoul', country: 'South Korea', timezone: 'Asia/Seoul', region: 'asia-pacific', latitude: 37.4979, longitude: 127.0276, radius: 2000, tier: 'superprime' },
  { id: 'seoul-hannam-dong', name: 'Hannam-dong', city: 'Seoul', country: 'South Korea', timezone: 'Asia/Seoul', region: 'asia-pacific', latitude: 37.5340, longitude: 127.0000, radius: 1000, tier: 'superprime' },
  { id: 'seoul-seongsu-dong', name: 'Seongsu-dong', city: 'Seoul', country: 'South Korea', timezone: 'Asia/Seoul', region: 'asia-pacific', latitude: 37.5443, longitude: 127.0557, radius: 1200, tier: 'discovery' },

  // Shanghai
  { id: 'shanghai-jingan', name: "Jing'an", city: 'Shanghai', country: 'China', timezone: 'Asia/Shanghai', region: 'asia-pacific', latitude: 31.2286, longitude: 121.4481, radius: 1500, tier: 'metropolitan' },
  { id: 'shanghai-xintiandi', name: 'Xintiandi', city: 'Shanghai', country: 'China', timezone: 'Asia/Shanghai', region: 'asia-pacific', latitude: 31.2185, longitude: 121.4737, radius: 800, tier: 'superprime' },
  { id: 'shanghai-french-concession', name: 'French Concession', city: 'Shanghai', country: 'China', timezone: 'Asia/Shanghai', region: 'asia-pacific', latitude: 31.2100, longitude: 121.4500, radius: 1500, tier: 'metropolitan' },

  // Beijing
  { id: 'beijing-sanlitun', name: 'Sanlitun', city: 'Beijing', country: 'China', timezone: 'Asia/Shanghai', region: 'asia-pacific', latitude: 39.9353, longitude: 116.4546, radius: 1200, tier: 'metropolitan' },

  // Bangkok
  { id: 'bangkok-thong-lo', name: 'Thong Lo', city: 'Bangkok', country: 'Thailand', timezone: 'Asia/Bangkok', region: 'asia-pacific', latitude: 13.7295, longitude: 100.5855, radius: 1200, tier: 'metropolitan' },
  { id: 'bangkok-sathorn', name: 'Sathorn', city: 'Bangkok', country: 'Thailand', timezone: 'Asia/Bangkok', region: 'asia-pacific', latitude: 13.7220, longitude: 100.5290, radius: 1500, tier: 'metropolitan' },

  // Bali
  { id: 'bali-canggu', name: 'Canggu', city: 'Bali', country: 'Indonesia', timezone: 'Asia/Makassar', region: 'asia-pacific', latitude: -8.6478, longitude: 115.1385, radius: 3000, tier: 'discovery' },
  { id: 'bali-uluwatu', name: 'Uluwatu', city: 'Bali', country: 'Indonesia', timezone: 'Asia/Makassar', region: 'asia-pacific', latitude: -8.8291, longitude: 115.0849, radius: 3000, tier: 'discovery' },

  // Jakarta
  { id: 'jakarta-menteng', name: 'Menteng', city: 'Jakarta', country: 'Indonesia', timezone: 'Asia/Jakarta', region: 'asia-pacific', latitude: -6.1958, longitude: 106.8420, radius: 1500, tier: 'metropolitan' },

  // Sydney
  { id: 'sydney-point-piper', name: 'Point Piper', city: 'Sydney', country: 'Australia', timezone: 'Australia/Sydney', region: 'asia-pacific', latitude: -33.8636, longitude: 151.2524, radius: 800, tier: 'superprime' },
  { id: 'sydney-vaucluse', name: 'Vaucluse', city: 'Sydney', country: 'Australia', timezone: 'Australia/Sydney', region: 'asia-pacific', latitude: -33.8580, longitude: 151.2780, radius: 1000, tier: 'superprime' },
  { id: 'sydney-double-bay', name: 'Double Bay', city: 'Sydney', country: 'Australia', timezone: 'Australia/Sydney', region: 'asia-pacific', latitude: -33.8779, longitude: 151.2430, radius: 800, tier: 'metropolitan' },
  { id: 'sydney-bondi-beach', name: 'Bondi Beach', city: 'Sydney', country: 'Australia', timezone: 'Australia/Sydney', region: 'asia-pacific', latitude: -33.8908, longitude: 151.2743, radius: 1200, tier: 'metropolitan' },
  { id: 'sydney-surry-hills', name: 'Surry Hills', city: 'Sydney', country: 'Australia', timezone: 'Australia/Sydney', region: 'asia-pacific', latitude: -33.8849, longitude: 151.2117, radius: 900, tier: 'discovery' },

  // Melbourne
  { id: 'melbourne-toorak', name: 'Toorak', city: 'Melbourne', country: 'Australia', timezone: 'Australia/Melbourne', region: 'asia-pacific', latitude: -37.8426, longitude: 145.0188, radius: 1200, tier: 'superprime' },
  { id: 'melbourne-south-yarra', name: 'South Yarra', city: 'Melbourne', country: 'Australia', timezone: 'Australia/Melbourne', region: 'asia-pacific', latitude: -37.8380, longitude: 144.9930, radius: 1200, tier: 'metropolitan' },
  { id: 'melbourne-fitzroy', name: 'Fitzroy', city: 'Melbourne', country: 'Australia', timezone: 'Australia/Melbourne', region: 'asia-pacific', latitude: -37.7987, longitude: 144.9780, radius: 900, tier: 'discovery' },

  // Auckland
  { id: 'auckland-remuera', name: 'Remuera', city: 'Auckland', country: 'New Zealand', timezone: 'Pacific/Auckland', region: 'asia-pacific', latitude: -36.8760, longitude: 174.7900, radius: 1500, tier: 'metropolitan' },

  // ═══════════════════════════════════════════════════════════════════
  // MIDDLE EAST & AFRICA
  // ═══════════════════════════════════════════════════════════════════

  // Dubai
  { id: 'dubai-downtown', name: 'Downtown Dubai', city: 'Dubai', country: 'UAE', timezone: 'Asia/Dubai', region: 'middle-east', latitude: 25.1972, longitude: 55.2744, radius: 1500, tier: 'superprime' },
  { id: 'dubai-palm-jumeirah', name: 'Palm Jumeirah', city: 'Dubai', country: 'UAE', timezone: 'Asia/Dubai', region: 'middle-east', latitude: 25.1124, longitude: 55.1390, radius: 3000, tier: 'superprime' },
  { id: 'dubai-difc', name: 'DIFC', city: 'Dubai', country: 'UAE', timezone: 'Asia/Dubai', region: 'middle-east', latitude: 25.2109, longitude: 55.2815, radius: 800, tier: 'metropolitan' },
  { id: 'dubai-marina', name: 'Dubai Marina', city: 'Dubai', country: 'UAE', timezone: 'Asia/Dubai', region: 'middle-east', latitude: 25.0805, longitude: 55.1403, radius: 1500, tier: 'metropolitan' },
  { id: 'dubai-al-barari', name: 'Al Barari', city: 'Dubai', country: 'UAE', timezone: 'Asia/Dubai', region: 'middle-east', latitude: 25.1050, longitude: 55.3100, radius: 2000, tier: 'superprime' },

  // Riyadh
  { id: 'riyadh-al-olaya', name: 'Al Olaya', city: 'Riyadh', country: 'Saudi Arabia', timezone: 'Asia/Riyadh', region: 'middle-east', latitude: 24.6900, longitude: 46.6850, radius: 2000, tier: 'metropolitan' },

  // Tel Aviv
  { id: 'telaviv-neve-tzedek', name: 'Neve Tzedek', city: 'Tel Aviv', country: 'Israel', timezone: 'Asia/Jerusalem', region: 'middle-east', latitude: 32.0589, longitude: 34.7656, radius: 700, tier: 'metropolitan' },
  { id: 'telaviv-rothschild', name: 'Rothschild Boulevard', city: 'Tel Aviv', country: 'Israel', timezone: 'Asia/Jerusalem', region: 'middle-east', latitude: 32.0636, longitude: 34.7731, radius: 900, tier: 'metropolitan' },

  // Cape Town
  { id: 'capetown-camps-bay', name: 'Camps Bay', city: 'Cape Town', country: 'South Africa', timezone: 'Africa/Johannesburg', region: 'middle-east', latitude: -33.9510, longitude: 18.3776, radius: 1500, tier: 'superprime' },
  { id: 'capetown-clifton', name: 'Clifton', city: 'Cape Town', country: 'South Africa', timezone: 'Africa/Johannesburg', region: 'middle-east', latitude: -33.9390, longitude: 18.3730, radius: 1000, tier: 'superprime' },
  { id: 'capetown-waterfront', name: 'V&A Waterfront', city: 'Cape Town', country: 'South Africa', timezone: 'Africa/Johannesburg', region: 'middle-east', latitude: -33.9036, longitude: 18.4207, radius: 1000, tier: 'metropolitan' },

  // Johannesburg
  { id: 'joburg-sandton', name: 'Sandton', city: 'Johannesburg', country: 'South Africa', timezone: 'Africa/Johannesburg', region: 'middle-east', latitude: -26.1076, longitude: 28.0567, radius: 2000, tier: 'metropolitan' },

  // Cairo
  { id: 'cairo-zamalek', name: 'Zamalek', city: 'Cairo', country: 'Egypt', timezone: 'Africa/Cairo', region: 'middle-east', latitude: 30.0617, longitude: 31.2188, radius: 1200, tier: 'metropolitan' },

  // ═══════════════════════════════════════════════════════════════════
  // SOUTH AMERICA
  // ═══════════════════════════════════════════════════════════════════

  // São Paulo
  { id: 'saopaulo-jardim-europa', name: 'Jardim Europa', city: 'São Paulo', country: 'Brazil', timezone: 'America/Sao_Paulo', region: 'south-america', latitude: -23.5727, longitude: -46.6810, radius: 1200, tier: 'superprime' },
  { id: 'saopaulo-itaim-bibi', name: 'Itaim Bibi', city: 'São Paulo', country: 'Brazil', timezone: 'America/Sao_Paulo', region: 'south-america', latitude: -23.5857, longitude: -46.6760, radius: 1200, tier: 'metropolitan' },
  { id: 'saopaulo-vila-madalena', name: 'Vila Madalena', city: 'São Paulo', country: 'Brazil', timezone: 'America/Sao_Paulo', region: 'south-america', latitude: -23.5530, longitude: -46.6910, radius: 1000, tier: 'discovery' },

  // Rio de Janeiro
  { id: 'rio-leblon', name: 'Leblon', city: 'Rio de Janeiro', country: 'Brazil', timezone: 'America/Sao_Paulo', region: 'south-america', latitude: -22.9847, longitude: -43.2233, radius: 1000, tier: 'superprime' },
  { id: 'rio-ipanema', name: 'Ipanema', city: 'Rio de Janeiro', country: 'Brazil', timezone: 'America/Sao_Paulo', region: 'south-america', latitude: -22.9838, longitude: -43.2045, radius: 1200, tier: 'metropolitan' },

  // Buenos Aires
  { id: 'buenosaires-palermo-soho', name: 'Palermo Soho', city: 'Buenos Aires', country: 'Argentina', timezone: 'America/Argentina/Buenos_Aires', region: 'south-america', latitude: -34.5880, longitude: -58.4280, radius: 1000, tier: 'discovery' },
  { id: 'buenosaires-recoleta', name: 'Recoleta', city: 'Buenos Aires', country: 'Argentina', timezone: 'America/Argentina/Buenos_Aires', region: 'south-america', latitude: -34.5875, longitude: -58.3935, radius: 1200, tier: 'metropolitan' },
  { id: 'buenosaires-puerto-madero', name: 'Puerto Madero', city: 'Buenos Aires', country: 'Argentina', timezone: 'America/Argentina/Buenos_Aires', region: 'south-america', latitude: -34.6113, longitude: -58.3600, radius: 1500, tier: 'metropolitan' },

  // Santiago
  { id: 'santiago-vitacura', name: 'Vitacura', city: 'Santiago', country: 'Chile', timezone: 'America/Santiago', region: 'south-america', latitude: -33.3908, longitude: -70.5800, radius: 2000, tier: 'metropolitan' },

  // Medellín
  { id: 'medellin-el-poblado', name: 'El Poblado', city: 'Medellín', country: 'Colombia', timezone: 'America/Bogota', region: 'south-america', latitude: 6.2086, longitude: -75.5659, radius: 2000, tier: 'discovery' },
];

// ─── MAIN ──────────────────────────────────────────────────────────

async function main() {
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log(`Seeding ${FLANEUR_200.length} Flaneur 200 neighborhoods...\n`);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  // Process in batches of 10
  const BATCH_SIZE = 10;
  for (let i = 0; i < FLANEUR_200.length; i += BATCH_SIZE) {
    const batch = FLANEUR_200.slice(i, i + BATCH_SIZE);

    const rows = batch.map(n => ({
      id: n.id,
      name: n.name,
      city: n.city,
      country: n.country,
      timezone: n.timezone,
      region: n.region,
      latitude: n.latitude,
      longitude: n.longitude,
      radius: n.radius,
      is_active: true,
      is_coming_soon: false,
    }));

    const { data, error } = await supabase
      .from('neighborhoods')
      .upsert(rows, { onConflict: 'id' })
      .select('id');

    if (error) {
      console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${error.message}`);
      errors += batch.length;
    } else {
      // Check which were inserts vs updates by querying
      const count = data?.length || 0;
      updated += count; // upsert doesn't distinguish, count all as processed
      const names = batch.map(n => n.name).join(', ');
      console.log(`  [${i + 1}-${i + batch.length}] ${names}`);
    }
  }

  console.log(`\n--- Results ---`);
  console.log(`Processed: ${FLANEUR_200.length - errors}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total neighborhoods in Flaneur 200: ${FLANEUR_200.length}`);

  // Print tier summary for updating ad-tiers.ts
  const superprime = FLANEUR_200.filter(n => n.tier === 'superprime');
  const metropolitan = FLANEUR_200.filter(n => n.tier === 'metropolitan');
  const discovery = FLANEUR_200.filter(n => n.tier === 'discovery');

  console.log(`\n--- Tier Distribution ---`);
  console.log(`Superprime (Tier 1): ${superprime.length}`);
  console.log(`Metropolitan (Tier 2): ${metropolitan.length}`);
  console.log(`Discovery (Tier 3): ${discovery.length}`);

  console.log(`\n--- Tier 1 IDs (for ad-tiers.ts) ---`);
  console.log(superprime.map(n => `'${n.id}'`).join(',\n'));

  console.log(`\n--- Tier 2 IDs (for ad-tiers.ts) ---`);
  console.log(metropolitan.map(n => `'${n.id}'`).join(',\n'));

  console.log('\nDone!');
}

main().catch(console.error);
