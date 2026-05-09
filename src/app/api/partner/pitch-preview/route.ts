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

    const {
      agentName,
      agentEmail,
      neighborhoodId,
      brokerageName,
      agentTitle,
      agentPhone,
      subscribeUrl,
      // Campaign-2 extensions: if isSampleCampaign is true, the email renders
      // a "SAMPLE EDITION" banner and uses senderDisplayName for the from-line
      // prefix (instead of the broker's real name) so the send is unambiguously
      // a demo, not impersonation. Body still shows the broker's real name in
      // the "Curated by" line so they can picture their own branding.
      isSampleCampaign,
      senderDisplayName,
    } = await request.json();

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
      isSampleCampaign: !!isSampleCampaign,
    };

    const html = await render(BrandedDailyBriefTemplate({ ...content, agentBranding }));

    const neighborhoodName = neighborhood.name || neighborhoodId;
    // Use the real product subject format so the preview looks identical to what
    // clients would receive — "juliet's new ending, östermalm" style, not a labeled demo.
    const subject = buildSubject(content);
    // From-line uses senderDisplayName (e.g., "Flaneur Sample") for cold sample
    // sends so the recipient sees a clearly-labeled demo, not an impersonation.
    // Falls back to agentName for the original cold-pitch use case.
    const fromPrefix = senderDisplayName || agentName;
    const fromMailbox = isSampleCampaign
      ? `sample@outreach.readflaneur.com`
      : `${neighborhood.id}@readflaneur.com`;
    const fromAddress = `${fromPrefix}: ${neighborhoodName} Daily <${fromMailbox}>`;

    const success = await sendEmail({
      to: agentEmail,
      subject,
      html,
      from: fromAddress,
    });

    if (!success) {
      return NextResponse.json({ error: 'Failed to send preview email' }, { status: 500 });
    }

    // Add to waitlist so that if this neighborhood later gets taken and then
    // cancels, we can automatically re-notify everyone we originally pitched.
    const normalizedEmail = String(agentEmail).toLowerCase().trim();
    supabaseAdmin
      .from('partner_waitlist')
      .upsert(
        {
          neighborhood_id: neighborhoodId,
          broker_email: normalizedEmail,
          broker_name: agentName || null,
          brokerage_name: brokerageName || null,
          source: 'cold_pitch',
        },
        { onConflict: 'neighborhood_id,broker_email', ignoreDuplicates: true }
      )
      .then((res) => {
        if (res.error) console.error('pitch-preview waitlist upsert failed:', res.error);
      }, (err) => console.error('pitch-preview waitlist upsert rejected:', err));

    return NextResponse.json({ success: true, sentTo: agentEmail });
  } catch (err) {
    console.error('Pitch preview error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
