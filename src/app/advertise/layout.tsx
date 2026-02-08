import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient();
  const { data: neighborhoods } = await supabase
    .from('neighborhoods')
    .select('id, city, is_combo')
    .eq('is_active', true);

  const regular = (neighborhoods || []).filter(n => !n.is_combo);
  const neighborhoodCount = regular.length;
  const cityCount = new Set(regular.map(n => n.city)).size;

  return {
    title: 'Advertise | Flaneur',
    description: `Sponsor the world's most exclusive local feed. Reach ultra-high-net-worth readers across ${neighborhoodCount} neighborhoods in ${cityCount} cities.`,
  };
}

export default function AdvertiseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
