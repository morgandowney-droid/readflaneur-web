import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { render } from '@react-email/components';
import { sendEmail } from '@/lib/email';
import { BrandedDailyBriefTemplate } from '@/lib/email/templates/BrandedDailyBriefTemplate';
import { assembleDailyBrief } from '@/lib/email/assembler';
import { EmailRecipient } from '@/lib/email/types';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const { agentPartnerId } = await request.json();

    if (!agentPartnerId) {
      return NextResponse.json({ error: 'Missing agentPartnerId' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch agent partner
    const { data: partner } = await supabaseAdmin
      .from('agent_partners')
      .select('*')
      .eq('id', agentPartnerId)
      .single();

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    // Fetch neighborhood info
    const { data: neighborhood } = await supabaseAdmin
      .from('neighborhoods')
      .select('id, name, city, timezone')
      .eq('id', partner.neighborhood_id)
      .single();

    if (!neighborhood) {
      return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
    }

    // Build a fake recipient to assemble content
    const fakeRecipient: EmailRecipient = {
      id: partner.id,
      email: partner.agent_email,
      source: 'newsletter',
      timezone: neighborhood.timezone || 'America/New_York',
      primaryNeighborhoodId: partner.neighborhood_id,
      subscribedNeighborhoodIds: [partner.neighborhood_id],
      unsubscribeToken: 'preview',
      pausedTopics: [],
    };

    // Assemble the real daily brief content
    const content = await assembleDailyBrief(supabaseAdmin, fakeRecipient);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';
    const agentBranding = {
      agentName: partner.agent_name,
      agentTitle: partner.agent_title || undefined,
      brokerageName: partner.brokerage_name || undefined,
      agentPhone: partner.agent_phone || undefined,
      agentPhotoUrl: partner.agent_photo_url || undefined,
      listings: partner.listings || [],
      subscribeUrl: `${appUrl}/r/${partner.agent_slug}`,
    };

    // Render branded template
    const html = await render(BrandedDailyBriefTemplate({ ...content, agentBranding }));

    const neighborhoodName = neighborhood.name || partner.neighborhood_id;
    const subject = `[Preview] ${neighborhoodName.toLowerCase()} daily`;

    const fromAddress = `${partner.agent_name}: ${neighborhoodName} Daily <${partner.neighborhood_id}@readflaneur.com>`;

    const success = await sendEmail({
      to: partner.agent_email,
      subject,
      html,
      from: fromAddress,
    });

    if (!success) {
      return NextResponse.json({ error: 'Failed to send preview email' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Partner preview error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
