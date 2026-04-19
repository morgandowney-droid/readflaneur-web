import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { render } from '@react-email/components';
import { sendEmail } from '@/lib/email';
import { BrandedDailyBriefTemplate } from '@/lib/email/templates/BrandedDailyBriefTemplate';
import { assembleDailyBrief } from '@/lib/email/assembler';
import { buildSubject } from '@/lib/email/sender';
import { EmailRecipient } from '@/lib/email/types';

export const maxDuration = 30;

/**
 * Pitch-preview endpoint: sends a real branded Daily Brief to a prospective
 * broker WITHOUT creating an agent_partners row or newsletter_subscribers
 * record. Used in cold-pitch outreach so the broker sees exactly what their
 * clients would receive, with their name on it, before signing up.
 *
 * Gated by CRON_SECRET to prevent abuse as a third-party spam vector.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { agentName, agentEmail, neighborhoodId, brokerageName, agentTitle, agentPhone, subscribeUrl } =
      await request.json();

    if (!agentName || !agentEmail || !neighborhoodId) {
      return NextResponse.json(
        { error: 'agentName, agentEmail, and neighborhoodId required' },
        { status: 400 }
      );
    }
    if (!agentEmail.includes('@')) {
      return NextResponse.json({ error: 'Invalid agentEmail' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: neighborhood } = await supabaseAdmin
      .from('neighborhoods')
      .select('id, name, city, timezone')
      .eq('id', neighborhoodId)
      .single();

    if (!neighborhood) {
      return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
    }

    const fakeRecipient: EmailRecipient = {
      id: `pitch-${Date.now()}`,
      email: agentEmail,
      source: 'newsletter',
      timezone: neighborhood.timezone || 'America/New_York',
      primaryNeighborhoodId: neighborhood.id,
      subscribedNeighborhoodIds: [neighborhood.id],
      unsubscribeToken: 'pitch-preview',
      pausedTopics: [],
    };

    const content = await assembleDailyBrief(supabaseAdmin, fakeRecipient);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/[\n\r]+$/, '').replace(/\/$/, '')
      || 'https://readflaneur.com';

    const agentBranding = {
      agentName,
      agentTitle: agentTitle || undefined,
      brokerageName: brokerageName || undefined,
      agentPhone: agentPhone || undefined,
      agentPhotoUrl: undefined,
      listings: [],
      subscribeUrl: subscribeUrl || `${appUrl}/partner`,
      // Signal to the template to render placeholder listing cards + photo/contact stubs
      // so the prospective broker sees the full product surface before uploading assets.
      isPitchPreview: true,
    };

    const html = await render(BrandedDailyBriefTemplate({ ...content, agentBranding }));

    const neighborhoodName = neighborhood.name || neighborhoodId;
    // Use the real product subject format so the preview looks identical to what
    // clients would receive — "juliet's new ending, östermalm" style, not a labeled demo.
    const subject = buildSubject(content);
    const fromAddress = `${agentName}: ${neighborhoodName} Daily <${neighborhood.id}@readflaneur.com>`;

    const success = await sendEmail({
      to: agentEmail,
      subject,
      html,
      from: fromAddress,
    });

    if (!success) {
      return NextResponse.json({ error: 'Failed to send preview email' }, { status: 500 });
    }

    return NextResponse.json({ success: true, sentTo: agentEmail });
  } catch (err) {
    console.error('Pitch preview error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
