import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Advertise | Flaneur',
  description: 'Sponsor the world\'s most exclusive local feed. Reach ultra-high-net-worth readers across 128 neighborhoods in 38 cities.',
};

export default function AdvertiseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
