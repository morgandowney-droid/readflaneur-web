import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getPartnerId(request: NextRequest): string | null {
  return request.cookies.get('flaneur-partner-session')?.value || null;
}

export async function GET(request: NextRequest) {
  try {
    const partnerId = getPartnerId(request);
    if (!partnerId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: partner, error } = await supabaseAdmin
      .from('agent_partners')
      .select('*, neighborhood:neighborhoods(id, name, city, country)')
      .eq('id', partnerId)
      .single();

    if (error || !partner) {
      // Clear invalid session cookie
      const response = NextResponse.json({ error: 'Partner not found' }, { status: 404 });
      response.cookies.set('flaneur-partner-session', '', { maxAge: 0, path: '/' });
      return response;
    }

    // Count subscribers from /r/[slug] signups
    const { count: subscriberCount } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('id', { count: 'exact', head: true })
      .eq('partner_agent_id', partnerId);

    return NextResponse.json({
      partner,
      subscriberCount: subscriberCount || 0,
    });
  } catch (err) {
    console.error('[partner-me] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const partnerId = getPartnerId(request);
    if (!partnerId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { agentName, agentTitle, agentPhone, agentPhotoUrl, brokerageName, listings, clientEmails } = body;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify partner exists
    const { data: existing } = await supabaseAdmin
      .from('agent_partners')
      .select('id')
      .eq('id', partnerId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    // Build update object - only include provided fields
    const update: Record<string, unknown> = {};

    if (agentName !== undefined) update.agent_name = agentName;
    if (agentTitle !== undefined) update.agent_title = agentTitle || null;
    if (agentPhone !== undefined) update.agent_phone = agentPhone || null;
    if (agentPhotoUrl !== undefined) update.agent_photo_url = agentPhotoUrl || null;
    if (brokerageName !== undefined) update.brokerage_name = brokerageName || null;

    if (listings !== undefined) {
      update.listings = (listings || []).slice(0, 3);
    }

    if (clientEmails !== undefined) {
      const MAX_CLIENT_EMAILS = 500;
      const cleanEmails = (clientEmails || [])
        .map((e: string) => e.toLowerCase().trim())
        .filter((e: string) => e.includes('@'));
      update.client_emails = cleanEmails.slice(0, MAX_CLIENT_EMAILS);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('agent_partners')
      .update(update)
      .eq('id', partnerId)
      .select('*, neighborhood:neighborhoods(id, name, city, country)')
      .single();

    if (error) {
      console.error('[partner-me] Update error:', error);
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    return NextResponse.json({ partner: updated });
  } catch (err) {
    console.error('[partner-me] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
