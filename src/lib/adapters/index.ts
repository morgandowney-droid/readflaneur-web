/**
 * City Adapters Index
 *
 * Factory for creating city-specific data adapters.
 * Each adapter implements the ICityAdapter interface for standardized data access.
 */

export * from './types';

import { ICityAdapter } from './types';
import { LondonAdapter } from './london-adapter';
import { SydneyAdapter } from './sydney-adapter';
import { ChicagoAdapter } from './chicago-adapter';
import { LosAngelesAdapter } from './los-angeles-adapter';
import { WashingtonDCAdapter } from './washington-dc-adapter';
import { DublinAdapter } from './dublin-adapter';
import {
  NewZealandAdapter,
  AucklandAdapter,
  QueenstownAdapter,
  createAucklandAdapter,
  createQueenstownAdapter,
} from './nz-adapter';
import { VancouverAdapter } from './vancouver-adapter';
import { CapeTownAdapter } from './capetown-adapter';
import { SingaporeAdapter } from './singapore-adapter';
import { PalmBeachAdapter } from './palm-beach-adapter';
import { GreenwichAdapter } from './greenwich-adapter';

/**
 * Registry of available city adapters
 */
const ADAPTER_REGISTRY: Record<string, new () => ICityAdapter> = {
  LondonAdapter,
  SydneyAdapter,
  ChicagoAdapter,
  LosAngelesAdapter,
  WashingtonDCAdapter,
  DublinAdapter,
  AucklandAdapter,
  QueenstownAdapter,
  VancouverAdapter,
  CapeTownAdapter,
  SingaporeAdapter,
  PalmBeachAdapter,
  GreenwichAdapter,
};

/**
 * City name to adapter mapping
 */
const CITY_TO_ADAPTER: Record<string, string> = {
  London: 'LondonAdapter',
  Sydney: 'SydneyAdapter',
  Chicago: 'ChicagoAdapter',
  'Los Angeles': 'LosAngelesAdapter',
  'Washington DC': 'WashingtonDCAdapter',
  Dublin: 'DublinAdapter',
  Auckland: 'AucklandAdapter',
  Queenstown: 'QueenstownAdapter',
  Vancouver: 'VancouverAdapter',
  'Cape Town': 'CapeTownAdapter',
  Singapore: 'SingaporeAdapter',
  'Palm Beach': 'PalmBeachAdapter',
  Greenwich: 'GreenwichAdapter',
};

/**
 * Get adapter instance for a city
 *
 * @param city - City name (e.g., "London", "Sydney")
 * @returns ICityAdapter instance or null if not found
 */
export function getAdapter(city: string): ICityAdapter | null {
  const adapterName = CITY_TO_ADAPTER[city];
  if (!adapterName) {
    console.warn(`No adapter found for city: ${city}`);
    return null;
  }

  const AdapterClass = ADAPTER_REGISTRY[adapterName];
  if (!AdapterClass) {
    console.warn(`Adapter class not found: ${adapterName}`);
    return null;
  }

  return new AdapterClass();
}

/**
 * Get adapter instance by adapter name
 *
 * @param adapterName - Adapter class name (e.g., "LondonAdapter")
 * @returns ICityAdapter instance or null if not found
 */
export function getAdapterByName(adapterName: string): ICityAdapter | null {
  const AdapterClass = ADAPTER_REGISTRY[adapterName];
  if (!AdapterClass) {
    console.warn(`Adapter class not found: ${adapterName}`);
    return null;
  }

  return new AdapterClass();
}

/**
 * Get all available city names
 */
export function getAvailableCities(): string[] {
  return Object.keys(CITY_TO_ADAPTER);
}

/**
 * Get all available adapter names
 */
export function getAvailableAdapters(): string[] {
  return Object.keys(ADAPTER_REGISTRY);
}

/**
 * Check if a city has an adapter
 */
export function hasAdapter(city: string): boolean {
  return city in CITY_TO_ADAPTER;
}

// Export adapter classes for direct use
export { LondonAdapter } from './london-adapter';
export { SydneyAdapter } from './sydney-adapter';
export { ChicagoAdapter } from './chicago-adapter';
export { LosAngelesAdapter } from './los-angeles-adapter';
export { WashingtonDCAdapter } from './washington-dc-adapter';
export { DublinAdapter } from './dublin-adapter';
export {
  NewZealandAdapter,
  AucklandAdapter,
  QueenstownAdapter,
  createAucklandAdapter,
  createQueenstownAdapter,
} from './nz-adapter';
export { VancouverAdapter } from './vancouver-adapter';
export { CapeTownAdapter } from './capetown-adapter';
export { SingaporeAdapter } from './singapore-adapter';
export { PalmBeachAdapter } from './palm-beach-adapter';
export { GreenwichAdapter } from './greenwich-adapter';
