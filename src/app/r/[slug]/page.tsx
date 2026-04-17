import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { AgentSubscribeForm } from './AgentSubscribeForm';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getPartner(slug: string) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: partner } = await supabaseAdmin
    .from('agent_partners')
    .select('id, agent_name, agent_title, agent_email, agent_phone, agent_photo_url, brokerage_name, neighborhood_id, agent_slug, status')
    .eq('agent_slug', slug)
    .eq('status', 'active')
    .single();

  if (!partner) return null;

  const { data: neighborhood } = await supabaseAdmin
    .from('neighborhoods')
    .select('id, name, city, country')
    .eq('id', partner.neighborhood_id)
    .single();

  return { partner, neighborhood };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPartner(slug);
  if (!result) {
    return { title: 'Not Found' };
  }
  const { partner, neighborhood } = result;
  const neighborhoodName = neighborhood?.name || partner.neighborhood_id;

  return {
    title: `${neighborhoodName} Daily by ${partner.agent_name}`,
    description: `A daily newsletter about what's happening in ${neighborhoodName}. Restaurant openings, events, market news - delivered every morning at 7 AM.`,
    openGraph: {
      title: `${neighborhoodName} Daily by ${partner.agent_name}`,
      description: `Daily neighborhood newsletter curated by ${partner.agent_name}${partner.brokerage_name ? ` - ${partner.brokerage_name}` : ''}.`,
      siteName: 'Flaneur',
      type: 'website',
    },
  };
}

export default async function AgentSubscribePage({ params }: PageProps) {
  const { slug } = await params;
  const result = await getPartner(slug);
  if (!result) {
    notFound();
  }

  const { partner, neighborhood } = result;
  const neighborhoodName = neighborhood?.name || partner.neighborhood_id;
  const city = neighborhood?.city || '';

  return (
    <div className="min-h-screen bg-canvas text-fg flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        {/* Agent photo */}
        {partner.agent_photo_url && (
          <img
            src={partner.agent_photo_url}
            alt={partner.agent_name}
            className="w-20 h-20 rounded-full object-cover mx-auto mb-6"
          />
        )}

        {/* Newsletter title */}
        <h1 className="font-[family-name:var(--font-cormorant)] text-2xl md:text-3xl mb-2">
          {neighborhoodName} Daily
        </h1>

        {/* Agent attribution */}
        <p className="text-fg-muted text-sm mb-1">
          Curated by {partner.agent_name}
        </p>
        {partner.brokerage_name && (
          <p className="text-fg-subtle text-xs tracking-wide mb-6">
            {partner.brokerage_name}
          </p>
        )}

        {/* Description */}
        <p className="text-fg-muted text-sm leading-relaxed mb-8 max-w-sm mx-auto">
          A daily newsletter about what&apos;s happening in {neighborhoodName}{city ? `, ${city}` : ''}.
          Restaurant openings, events, market news - delivered every morning at 7 AM.
        </p>

        {/* Subscribe form */}
        <AgentSubscribeForm
          agentPartnerId={partner.id}
          neighborhoodId={partner.neighborhood_id}
          neighborhoodName={neighborhoodName}
        />

        {/* Fine print */}
        <p className="text-fg-subtle text-xs mt-4">
          Free - unsubscribe anytime
        </p>

        {/* Powered by */}
        <p className="text-fg-subtle text-xs mt-8">
          Neighborhood stories powered by{' '}
          <a href="https://readflaneur.com" className="underline hover:text-fg-muted">Flaneur</a>
        </p>
      </div>
    </div>
  );
}
