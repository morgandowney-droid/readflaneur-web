/**
 * Utility functions for combo neighborhoods
 *
 * Combo neighborhoods aggregate content from multiple component neighborhoods
 * into a single feed view. Example: "Brooklyn West" = Dumbo + Cobble Hill + Park Slope
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface ComboComponent {
  id: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  display_order: number;
}

export interface ComboInfo {
  isCombo: boolean;
  comboName: string;
  components: ComboComponent[];
}

/**
 * Check if a neighborhood is a combo neighborhood
 */
export async function isComboNeighborhood(
  supabase: SupabaseClient,
  neighborhoodId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('neighborhoods')
    .select('is_combo')
    .eq('id', neighborhoodId)
    .single();

  return data?.is_combo === true;
}

/**
 * Get neighborhood IDs to use for queries
 * For combo neighborhoods, returns component IDs
 * For regular neighborhoods, returns [neighborhoodId]
 */
export async function getNeighborhoodIdsForQuery(
  supabase: SupabaseClient,
  neighborhoodId: string
): Promise<string[]> {
  // First check if this is a combo
  const { data: neighborhood } = await supabase
    .from('neighborhoods')
    .select('is_combo')
    .eq('id', neighborhoodId)
    .single();

  if (!neighborhood?.is_combo) {
    return [neighborhoodId];
  }

  // Get component neighborhood IDs
  const { data: components } = await supabase
    .from('combo_neighborhoods')
    .select('component_id')
    .eq('combo_id', neighborhoodId)
    .order('display_order');

  if (!components || components.length === 0) {
    // Fallback to just the combo ID if no components found
    return [neighborhoodId];
  }

  // Include the combo ID itself since articles may be stored under it directly
  return [neighborhoodId, ...components.map(c => c.component_id)];
}

/**
 * Get combo info including component details
 * Returns null for non-combo neighborhoods
 */
export async function getComboInfo(
  supabase: SupabaseClient,
  neighborhoodId: string
): Promise<ComboInfo | null> {
  // Check if this is a combo
  const { data: neighborhood } = await supabase
    .from('neighborhoods')
    .select('id, name, is_combo')
    .eq('id', neighborhoodId)
    .single();

  if (!neighborhood?.is_combo) {
    return null;
  }

  // Get component neighborhoods with full details
  const { data: links } = await supabase
    .from('combo_neighborhoods')
    .select(`
      display_order,
      component:neighborhoods!combo_neighborhoods_component_id_fkey (
        id,
        name,
        city,
        latitude,
        longitude
      )
    `)
    .eq('combo_id', neighborhoodId)
    .order('display_order');

  if (!links || links.length === 0) {
    return null;
  }

  const components: ComboComponent[] = links.map((link: any) => ({
    id: link.component.id,
    name: link.component.name,
    city: link.component.city,
    latitude: link.component.latitude,
    longitude: link.component.longitude,
    display_order: link.display_order,
  }));

  return {
    isCombo: true,
    comboName: neighborhood.name,
    components,
  };
}

/**
 * Reverse lookup: given a component neighborhood ID, find its parent combo
 * Returns { comboId, comboName } or null if not a component of any combo
 */
export async function getComboForComponent(
  supabase: SupabaseClient,
  componentId: string
): Promise<{ comboId: string; comboName: string } | null> {
  const { data } = await supabase
    .from('combo_neighborhoods')
    .select('combo_id, combo:neighborhoods!combo_neighborhoods_combo_id_fkey(id, name)')
    .eq('component_id', componentId)
    .limit(1)
    .single();

  if (!data?.combo) return null;

  const combo = data.combo as unknown as { id: string; name: string };
  return { comboId: combo.id, comboName: combo.name };
}

/**
 * Get component names as a comma-separated string
 * Useful for display like "Includes: Dumbo, Cobble Hill, Park Slope"
 */
export async function getComponentNamesString(
  supabase: SupabaseClient,
  neighborhoodId: string
): Promise<string | null> {
  const comboInfo = await getComboInfo(supabase, neighborhoodId);
  if (!comboInfo) return null;

  return comboInfo.components.map(c => c.name).join(', ');
}
