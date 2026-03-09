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

  const description = `Sponsor the world's most exclusive local feed. Reach ultra-high-net-worth readers across ${neighborhoodCount} neighborhoods in ${cityCount} cities.`;
  return {
    title: 'Advertise | Flaneur',
    description,
    openGraph: {
      title: `Advertise on Flaneur - ${neighborhoodCount} Neighborhoods, ${cityCount} Cities`,
      description,
      siteName: 'Flaneur',
      url: 'https://readflaneur.com/advertise',
      type: 'website',
      images: [{ url: 'https://readflaneur.com/og-default.png', width: 1200, height: 630, alt: 'Advertise on Flaneur' }],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title: `Advertise on Flaneur - ${neighborhoodCount} Neighborhoods, ${cityCount} Cities`,
      description,
      images: ['https://readflaneur.com/og-default.png'],
    },
  };
}

export default function AdvertiseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
