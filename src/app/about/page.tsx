import { createClient } from '@/lib/supabase/server';
import { AboutContent } from './AboutContent';

export const dynamic = 'force-dynamic';

export default async function AboutPage() {
  const supabase = await createClient();

  // Fetch neighborhood stats
  const { data: neighborhoods } = await supabase
    .from('neighborhoods')
    .select('id, name, city, region, is_combo')
    .eq('is_active', true);

  // Calculate counts
  // Exclude combo neighborhoods from the count (they aggregate other neighborhoods)
  const regularNeighborhoods = (neighborhoods || []).filter(n => !n.is_combo);
  const neighborhoodCount = regularNeighborhoods.length;

  // Count unique cities (including vacation destinations)
  const cityCount = new Set(regularNeighborhoods.map(n => n.city)).size;

  // Count vacation destinations
  const vacationCount = regularNeighborhoods.filter(n => n.region?.includes('vacation')).length;

  return (
    <AboutContent
      neighborhoodCount={neighborhoodCount}
      cityCount={cityCount}
      vacationCount={vacationCount}
    />
  );
}
