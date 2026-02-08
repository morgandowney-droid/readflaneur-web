import { Metadata } from 'next';
import { SITE_STATS } from '@/config/site-stats';

export const metadata: Metadata = {
  title: 'Advertise | Flaneur',
  description: `Sponsor the world's most exclusive local feed. Reach ultra-high-net-worth readers across ${SITE_STATS.neighborhoods} neighborhoods in ${SITE_STATS.cities} cities.`,
};

export default function AdvertiseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
