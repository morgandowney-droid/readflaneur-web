import { Suspense } from 'react';
import { InviteHero } from '@/components/invite/InviteHero';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Join Flaneur - Local stories, interesting neighborhoods',
  description: 'A friend invited you to Flaneur. Get daily local stories from the neighborhoods you care about.',
  openGraph: {
    title: 'Join Flaneur - Your neighborhoods, every morning',
    description: 'Daily local news and events from 270+ neighborhoods worldwide. Free, delivered at 7 AM.',
    siteName: 'Flaneur',
    url: 'https://readflaneur.com/invite',
    type: 'website',
    images: [{ url: 'https://readflaneur.com/og-default.png', width: 1200, height: 630, alt: 'Join Flaneur' }],
  },
  twitter: {
    card: 'summary_large_image' as const,
    title: 'Join Flaneur - Your neighborhoods, every morning',
    description: 'Daily local news and events from 270+ neighborhoods worldwide. Free, delivered at 7 AM.',
    images: ['https://readflaneur.com/og-default.png'],
  },
};

export default function InvitePage() {
  return (
    <div className="min-h-screen">
      {/* No SmartRedirect - visitors should see the invite page */}
      <Suspense fallback={
        <section data-theme="dark" className="relative overflow-hidden bg-black text-white py-24 md:py-32 lg:py-40 px-6">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at top, rgba(30,30,30,1), rgba(0,0,0,1) 70%)' }} />
          <div className="relative mx-auto max-w-3xl text-center">
            <h1 className="font-display text-6xl md:text-7xl lg:text-8xl font-light tracking-[0.3em] mb-6">FLANEUR</h1>
          </div>
        </section>
      }>
        <InviteHero />
      </Suspense>
    </div>
  );
}
