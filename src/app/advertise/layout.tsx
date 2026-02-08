import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Advertise | Flaneur',
  description: 'Sponsor the world\'s most exclusive local feed. Reach ultra-high-net-worth readers across 200 neighborhoods in 73 cities.',
};

export default function AdvertiseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
