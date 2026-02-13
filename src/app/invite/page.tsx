import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { HomeSignupEnhanced } from '@/components/home/HomeSignupEnhanced';
import { InviteHero } from '@/components/invite/InviteHero';
import { Neighborhood } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Join Flaneur - Local stories, interesting neighborhoods',
  description: 'A friend invited you to Flaneur. Choose your neighborhoods and get daily local stories.',
};

export default async function InvitePage() {
  const supabase = await createClient();

  const { data: neighborhoodsData } = await supabase
    .from('neighborhoods')
    .select('*')
    .eq('is_active', true)
    .order('city')
    .order('name');

  const neighborhoods = (neighborhoodsData || []) as Neighborhood[];

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

      {/* Neighborhood Selection */}
      <section className="bg-canvas py-16 md:py-20 px-6">
        <div className="mx-auto max-w-2xl text-center">
          <HomeSignupEnhanced neighborhoods={neighborhoods} />
        </div>
      </section>
    </div>
  );
}
