import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

function generateSlug(name: string, neighborhoodId: string): string {
  const clean = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${clean(name)}-${clean(neighborhoodId)}`;
}

async function sendSubscribeLinkEmail(params: {
  agentEmail: string;
  agentName: string;
  agentSlug: string;
  neighborhoodName: string;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/[\n\r]+$/, '').replace(/\/$/, '')
    || 'https://readflaneur.com';
  const subscribeUrl = `${appUrl}/r/${params.agentSlug}`;
  try {
    await sendEmail({
      to: params.agentEmail,
      subject: `Your ${params.neighborhoodName} subscribe link`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; color: #1c1917; line-height: 1.6;">
          <p style="font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: #78716c; margin: 0 0 24px;">Your subscribe link</p>
          <h1 style="font-size: 24px; font-weight: 300; margin: 0 0 16px;">Keep this link handy, ${params.agentName}</h1>
          <p>This is the link your clients use to subscribe to your branded ${params.neighborhoodName} Daily Brief. Put it on your website, in your email signature, or send it directly to past clients.</p>
          <p style="word-break: break-all; font-family: monospace; background: #fafaf9; padding: 16px; border-radius: 4px; font-size: 15px; margin: 24px 0;"><a href="${subscribeUrl}" style="color: #b45309;">${subscribeUrl}</a></p>
          <p style="color: #57534e; font-size: 14px;">You can also invite clients directly from your setup page - just paste their emails into the client list. If you haven&apos;t activated yet, open your setup page to finish and send your first preview.</p>
          <p style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e7e5e4; color: #78716c; font-size: 13px;">Questions? Just reply to this email.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Failed to send subscribe link email:', err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      agentName,
      agentTitle,
      agentEmail,
      agentPhone,
      agentPhotoUrl,
      brokerageName,
      neighborhoodId,
      listings,
      clientEmails,
    } = body;

    if (!agentName || !agentEmail || !neighborhoodId) {
      return NextResponse.json(
        { error: 'Missing required fields: agentName, agentEmail, neighborhoodId' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if neighborhood exists
    const { data: neighborhood } = await supabaseAdmin
      .from('neighborhoods')
      .select('id, name')
      .eq('id', neighborhoodId)
      .single();

    if (!neighborhood) {
      return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
    }

    // Check if neighborhood already has an active/setup agent (that isn't this agent)
    const { data: existing } = await supabaseAdmin
      .from('agent_partners')
      .select('id, agent_email, status')
      .eq('neighborhood_id', neighborhoodId)
      .in('status', ['setup', 'active']);

    const normalizedEmail = agentEmail.toLowerCase().trim();
    const otherAgent = existing?.find(
      (a) => a.agent_email.toLowerCase() !== normalizedEmail
    );
    if (otherAgent) {
      return NextResponse.json(
        { error: 'This neighborhood already has an active agent partner' },
        { status: 409 }
      );
    }

    const slug = generateSlug(agentName, neighborhoodId);

    // Validate and clean client emails
    const cleanEmails = (clientEmails || [])
      .map((e: string) => e.toLowerCase().trim())
      .filter((e: string) => e.includes('@'));

    // Validate listings (max 3)
    const cleanListings = (listings || []).slice(0, 3);

    // Upsert by email + neighborhood
    const existingSelf = existing?.find(
      (a) => a.agent_email.toLowerCase() === normalizedEmail
    );

    if (existingSelf) {
      // Update existing record
      const { data: updated, error } = await supabaseAdmin
        .from('agent_partners')
        .update({
          agent_name: agentName,
          agent_title: agentTitle || null,
          agent_phone: agentPhone || null,
          agent_photo_url: agentPhotoUrl || null,
          brokerage_name: brokerageName || null,
          listings: cleanListings,
          client_emails: cleanEmails,
        })
        .eq('id', existingSelf.id)
        .select()
        .single();

      if (error) {
        console.error('Partner update error:', error);
        return NextResponse.json({ error: 'Failed to update partner' }, { status: 500 });
      }
      return NextResponse.json({ partner: updated });
    }

    // Create new record
    const { data: partner, error } = await supabaseAdmin
      .from('agent_partners')
      .insert({
        agent_name: agentName,
        agent_title: agentTitle || null,
        agent_email: normalizedEmail,
        agent_phone: agentPhone || null,
        agent_photo_url: agentPhotoUrl || null,
        brokerage_name: brokerageName || null,
        neighborhood_id: neighborhoodId,
        agent_slug: slug,
        listings: cleanListings,
        client_emails: cleanEmails,
      })
      .select()
      .single();

    if (error) {
      console.error('Partner create error:', error);
      // Handle slug collision
      if (error.code === '23505' && error.message?.includes('agent_slug')) {
        const fallbackSlug = `${slug}-${Date.now().toString(36).slice(-4)}`;
        const { data: retryPartner, error: retryError } = await supabaseAdmin
          .from('agent_partners')
          .insert({
            agent_name: agentName,
            agent_title: agentTitle || null,
            agent_email: normalizedEmail,
            agent_phone: agentPhone || null,
            agent_photo_url: agentPhotoUrl || null,
            brokerage_name: brokerageName || null,
            neighborhood_id: neighborhoodId,
            agent_slug: fallbackSlug,
            listings: cleanListings,
            client_emails: cleanEmails,
          })
          .select()
          .single();

        if (retryError) {
          return NextResponse.json({ error: 'Failed to create partner' }, { status: 500 });
        }
        sendSubscribeLinkEmail({
          agentEmail: normalizedEmail,
          agentName,
          agentSlug: fallbackSlug,
          neighborhoodName: neighborhood.name,
        }).catch(() => {});
        return NextResponse.json({ partner: retryPartner });
      }
      return NextResponse.json({ error: 'Failed to create partner' }, { status: 500 });
    }

    sendSubscribeLinkEmail({
      agentEmail: normalizedEmail,
      agentName,
      agentSlug: slug,
      neighborhoodName: neighborhood.name,
    }).catch(() => {});

    return NextResponse.json({ partner });
  } catch (err) {
    console.error('Partner setup error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
