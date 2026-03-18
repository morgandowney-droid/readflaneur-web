import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Neighborhood, GlobalRegion } from '@/types';

/**
 * @swagger
 * /api/neighborhoods:
 *   get:
 *     tags: [Neighborhoods]
 *     summary: Get all active neighborhoods
 *     description: Returns all active neighborhoods with hierarchical grouping by region, country, and city. Admin users see test-region neighborhoods; non-admins do not. Excludes removed community neighborhoods.
 *     parameters:
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *           enum: [north_america, south_america, europe, middle_east, asia_pacific, vacation, enclave, community]
 *         description: Filter by region
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter by country name
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: Filter by city name
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Only return active neighborhoods
 *     responses:
 *       200:
 *         description: Neighborhood data with groupings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 neighborhoods:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Neighborhood'
 *                 total:
 *                   type: integer
 *                 filters:
 *                   type: object
 *                   properties:
 *                     regions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     countries:
 *                       type: array
 *                       items:
 *                         type: string
 *                     cities:
 *                       type: array
 *                       items:
 *                         type: string
 */
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

  // Check if current user is admin
  const { data: { session } } = await supabase.auth.getSession();
  let isAdmin = false;
  if (session?.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();
    isAdmin = profile?.role === 'admin';
  }

  let query = supabase
    .from('neighborhoods')
    .select('*')
    .order('city', { ascending: true })
    .order('name', { ascending: true });

  // Filter by active status (include coming_soon in the list but mark them)
  if (activeOnly) {
    query = query.or('is_active.eq.true,is_coming_soon.eq.true');
  }

  // Exclude removed community neighborhoods
  query = query.or('community_status.is.null,community_status.neq.removed');

  // Hide test neighborhoods from non-admin users
  if (!isAdmin) {
    query = query.neq('region', 'test');
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

  // Fetch combo component names for combo neighborhoods
  const comboNeighborhoods = (neighborhoods || []).filter((n: any) => n.is_combo);
  const comboComponentNames: Record<string, string[]> = {};

  if (comboNeighborhoods.length > 0) {
    const { data: comboLinks } = await supabase
      .from('combo_neighborhoods')
      .select(`
        combo_id,
        display_order,
        component:neighborhoods!combo_neighborhoods_component_id_fkey (name)
      `)
      .in('combo_id', comboNeighborhoods.map((n: any) => n.id))
      .order('display_order');

    if (comboLinks) {
      comboLinks.forEach((link: any) => {
        if (!comboComponentNames[link.combo_id]) {
          comboComponentNames[link.combo_id] = [];
        }
        if (link.component?.name) {
          comboComponentNames[link.combo_id].push(link.component.name);
        }
      });
    }
  }

  // Add combo_component_names to each neighborhood
  const neighborhoodsWithCombo = (neighborhoods || []).map((n: any) => ({
    ...n,
    combo_component_names: comboComponentNames[n.id] || undefined,
  }));

  // Group neighborhoods hierarchically: region > country > city
  const grouped: NeighborhoodsByRegion = {};
  const byCountry: NeighborhoodsByCountry = {};
  const byCity: NeighborhoodsByCity = {};

  for (const hood of neighborhoodsWithCombo) {
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
  const regions = [...new Set(neighborhoodsWithCombo.map(n => n.region).filter(Boolean))] as GlobalRegion[];
  const countries = [...new Set(neighborhoodsWithCombo.map(n => n.country).filter(Boolean))] as string[];
  const cities = [...new Set(neighborhoodsWithCombo.map(n => n.city).filter(Boolean))] as string[];

  return NextResponse.json({
    neighborhoods: neighborhoodsWithCombo,
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
