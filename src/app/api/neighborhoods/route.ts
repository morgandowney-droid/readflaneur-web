import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Neighborhood, GlobalRegion } from '@/types';

interface NeighborhoodsByCity {
  [city: string]: Neighborhood[];
}

interface NeighborhoodsByCountry {
  [country: string]: NeighborhoodsByCity;
}

interface NeighborhoodsByRegion {
  [region: string]: NeighborhoodsByCountry;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const region = searchParams.get('region') as GlobalRegion | null;
  const country = searchParams.get('country');
  const city = searchParams.get('city');
  const activeOnly = searchParams.get('activeOnly') !== 'false'; // default true

  const supabase = await createClient();

  let query = supabase
    .from('neighborhoods')
    .select('*')
    .order('city', { ascending: true })
    .order('name', { ascending: true });

  // Filter by active status (include coming_soon in the list but mark them)
  if (activeOnly) {
    query = query.or('is_active.eq.true,is_coming_soon.eq.true');
  }

  // Apply filters if provided
  if (region) {
    query = query.eq('region', region);
  }
  if (country) {
    query = query.eq('country', country);
  }
  if (city) {
    query = query.eq('city', city);
  }

  const { data: neighborhoods, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group neighborhoods hierarchically: region > country > city
  const grouped: NeighborhoodsByRegion = {};
  const byCountry: NeighborhoodsByCountry = {};
  const byCity: NeighborhoodsByCity = {};

  for (const hood of neighborhoods || []) {
    const r = hood.region || 'other';
    const c = hood.country || 'Unknown';
    const ct = hood.city || 'Unknown';

    // Group by region > country > city
    if (!grouped[r]) grouped[r] = {};
    if (!grouped[r][c]) grouped[r][c] = {};
    if (!grouped[r][c][ct]) grouped[r][c][ct] = [];
    grouped[r][c][ct].push(hood);

    // Group by country > city
    if (!byCountry[c]) byCountry[c] = {};
    if (!byCountry[c][ct]) byCountry[c][ct] = [];
    byCountry[c][ct].push(hood);

    // Group by city
    if (!byCity[ct]) byCity[ct] = [];
    byCity[ct].push(hood);
  }

  // Get unique regions, countries, and cities for filter options
  const regions = [...new Set((neighborhoods || []).map(n => n.region).filter(Boolean))] as GlobalRegion[];
  const countries = [...new Set((neighborhoods || []).map(n => n.country).filter(Boolean))] as string[];
  const cities = [...new Set((neighborhoods || []).map(n => n.city).filter(Boolean))] as string[];

  return NextResponse.json({
    neighborhoods: neighborhoods || [],
    grouped,
    byCountry,
    byCity,
    filters: {
      regions: regions.sort(),
      countries: countries.sort(),
      cities: cities.sort(),
    },
    total: neighborhoods?.length || 0,
  });
}
