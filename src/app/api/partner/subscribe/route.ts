import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { email, agentPartnerId, neighborhoodId, timezone } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }
    if (!agentPartnerId || !neighborhoodId) {
      return NextResponse.json({ error: 'Missing agentPartnerId or neighborhoodId' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if already subscribed
    const { data: existing } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('id, neighborhood_ids, partner_agent_id')
      .eq('email', normalizedEmail)
      .single();

    if (existing) {
      // Update: add neighborhood if not present, set partner_agent_id
      const currentIds: string[] = existing.neighborhood_ids || [];
      const updatedIds = currentIds.includes(neighborhoodId)
        ? currentIds
        : [...currentIds, neighborhoodId];

      await supabaseAdmin
        .from('newsletter_subscribers')
        .update({
          neighborhood_ids: updatedIds,
          partner_agent_id: existing.partner_agent_id || agentPartnerId,
          daily_email_enabled: true,
        })
        .eq('id', existing.id);

      return NextResponse.json({ success: true, message: 'Subscription updated' });
    }

    // Auto-detect timezone from request headers if not provided
    const detectedTimezone = timezone || 'America/New_York';

    // Create new subscriber
    const { error: insertError } = await supabaseAdmin
      .from('newsletter_subscribers')
      .insert({
        email: normalizedEmail,
        neighborhood_ids: [neighborhoodId],
        timezone: detectedTimezone,
        daily_email_enabled: true,
        email_verified: true, // Agent-added subscribers are pre-verified
        partner_agent_id: agentPartnerId,
      });

    if (insertError) {
      console.error('Partner subscribe error:', insertError);
      return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Subscribed' });
  } catch (err) {
    console.error('Partner subscribe error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
