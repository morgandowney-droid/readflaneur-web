/**
 * Active Neighborhoods Resolver
 * Returns neighborhood IDs that have at least one active subscriber
 * (either via user_neighborhood_preferences or newsletter_subscribers)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getComboForComponent } from './combo-utils';

/**
 * Get the set of neighborhood IDs that have at least one subscriber.
 * Merges from:
 * - user_neighborhood_preferences (authenticated users)
 * - newsletter_subscribers.neighborhood_ids (email subscribers with daily_email_enabled)
 * Also includes combo IDs if any component has subscribers.
 */
export async function getActiveNeighborhoodIds(
  supabase: SupabaseClient
): Promise<Set<string>> {
  const ids = new Set<string>();

  // 1. Authenticated users' neighborhood preferences
  const { data: userPrefs } = await supabase
    .from('user_neighborhood_preferences')
    .select('neighborhood_id');

  if (userPrefs) {
    for (const pref of userPrefs) {
      ids.add(pref.neighborhood_id);
    }
  }

  // 2. Newsletter subscribers with daily email enabled
  const { data: subscribers } = await supabase
    .from('newsletter_subscribers')
    .select('neighborhood_ids')
    .eq('daily_email_enabled', true);

  if (subscribers) {
    for (const sub of subscribers) {
      if (Array.isArray(sub.neighborhood_ids)) {
        for (const id of sub.neighborhood_ids) {
          ids.add(id);
        }
      }
    }
  }

  // 3. Include combo IDs if any component has subscribers
  const componentIds = Array.from(ids);
  for (const componentId of componentIds) {
    const combo = await getComboForComponent(supabase, componentId);
    if (combo) {
      ids.add(combo.comboId);
    }
  }

  // 4. Expand combo IDs to include their component IDs
  // Users subscribe to combo IDs (e.g., nyc-tribeca) but articles are stored
  // under component IDs (e.g., nyc-tribeca-core, nyc-fidi). Crons that filter
  // out combos need the components in the active set to generate content.
  const allIds = Array.from(ids);
  for (const id of allIds) {
    const { data: components } = await supabase
      .from('combo_neighborhoods')
      .select('component_id')
      .eq('combo_id', id);

    if (components && components.length > 0) {
      for (const c of components) {
        ids.add(c.component_id);
      }
    }
  }

  return ids;
}
