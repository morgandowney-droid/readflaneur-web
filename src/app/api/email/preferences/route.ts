import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ResendTrigger } from '@/lib/email/instant-resend';

/**
 * Email preferences API (token-authenticated)
 *
 * GET  /api/email/preferences?token=xxx — Get subscriber preferences
 * POST /api/email/preferences            — Update preferences
 */

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function findSubscriber(supabase: ReturnType<typeof getSupabase>, token: string) {
  // Try newsletter_subscribers first
  const { data: subscriber } = await supabase
    .from('newsletter_subscribers')
    .select('id, email, neighborhood_ids, daily_email_enabled, sunday_edition_enabled, unsubscribe_token, paused_topics')
    .eq('unsubscribe_token', token)
    .single();

  if (subscriber) {
    return { ...subscriber, source: 'newsletter' as const };
  }

  // Try profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, primary_city, daily_email_enabled, sunday_edition_enabled, email_unsubscribe_token, paused_topics')
    .eq('email_unsubscribe_token', token)
    .single();

  if (profile) {
    // Fetch user's neighborhood preferences
    const { data: prefs } = await supabase
      .from('user_neighborhood_preferences')
      .select('neighborhood_id')
      .eq('user_id', profile.id);

    let neighborhoodIds = (prefs || []).map(p => p.neighborhood_id);

    // Fallback: check daily_brief_sends for what neighborhoods were sent
    if (neighborhoodIds.length === 0) {
      const { data: sends } = await supabase
        .from('daily_brief_sends')
        .select('primary_neighborhood_id')
        .eq('recipient_id', profile.id)
        .order('sent_at', { ascending: false })
        .limit(1)
        .single();

      if (sends?.primary_neighborhood_id) {
        // Get all neighborhoods from the most recent send
        const { data: recentSend } = await supabase
          .from('daily_brief_sends')
          .select('primary_neighborhood_id')
          .eq('recipient_id', profile.id)
          .order('sent_at', { ascending: false })
          .limit(5);

        const ids = [...new Set((recentSend || []).map(s => s.primary_neighborhood_id).filter(Boolean))];
        if (ids.length > 0) neighborhoodIds = ids;
      }
    }

    // Fallback: check localStorage-synced defaults (3 active neighborhoods)
    if (neighborhoodIds.length === 0) {
      const { data: defaults } = await supabase
        .from('neighborhoods')
        .select('id')
        .eq('is_active', true)
        .limit(3);
      neighborhoodIds = (defaults || []).map(n => n.id);
    }

    return {
      ...profile,
      source: 'profile' as const,
      neighborhood_ids: neighborhoodIds,
    };
  }

  return null;
}

async function triggerInstantResend(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  source: 'profile' | 'newsletter',
  trigger: ResendTrigger
): Promise<'sending' | 'rate_limited' | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\n$/, '').replace(/\/$/, '')
    || 'https://readflaneur.com';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return null;

  try {
    // Quick rate limit check
    const today = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from('instant_resend_log')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('send_date', today);

    if ((count || 0) >= 3) {
      return 'rate_limited';
    }

    fetch(`${baseUrl}/api/internal/resend-daily-brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
      body: JSON.stringify({ userId, source, trigger }),
    }).catch(() => {});

    return 'sending';
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const supabase = getSupabase();
  const subscriber = await findSubscriber(supabase, token);

  if (!subscriber) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  }

  // Fetch neighborhood details for all subscribed neighborhoods
  const neighborhoodIds = subscriber.neighborhood_ids || [];
  let neighborhoods: { id: string; name: string; city: string }[] = [];
  if (neighborhoodIds.length > 0) {
    const { data } = await supabase
      .from('neighborhoods')
      .select('id, name, city')
      .in('id', neighborhoodIds);
    neighborhoods = data || [];
  }

  // Fetch all available neighborhoods for adding
  const { data: allNeighborhoods } = await supabase
    .from('neighborhoods')
    .select('id, name, city, region, is_combo')
    .order('city')
    .order('name');

  // Fetch combo component names for any combo neighborhoods
  const comboIds = (allNeighborhoods || []).filter(n => n.is_combo).map(n => n.id);
  let comboComponentNames: Record<string, string[]> = {};
  if (comboIds.length > 0) {
    const { data: comboLinks } = await supabase
      .from('combo_neighborhoods')
      .select('combo_id, display_order, component:neighborhoods!combo_neighborhoods_component_id_fkey (name)')
      .in('combo_id', comboIds)
      .order('display_order');
    if (comboLinks) {
      for (const link of comboLinks) {
        if (!comboComponentNames[link.combo_id]) comboComponentNames[link.combo_id] = [];
        const comp = link.component as unknown as { name: string } | null;
        if (comp?.name) comboComponentNames[link.combo_id].push(comp.name);
      }
    }
  }

  const neighborhoodsWithCombo = (allNeighborhoods || []).map(n => ({
    ...n,
    combo_component_names: comboComponentNames[n.id] || undefined,
  }));

  return NextResponse.json({
    email: subscriber.email,
    source: subscriber.source,
    daily_email_enabled: subscriber.daily_email_enabled,
    sunday_edition_enabled: (subscriber as { sunday_edition_enabled?: boolean }).sunday_edition_enabled !== false,
    neighborhood_ids: neighborhoodIds,
    neighborhoods,
    primary_city: subscriber.source === 'profile' ? (subscriber as { primary_city?: string }).primary_city : null,
    all_neighborhoods: neighborhoodsWithCombo,
    paused_topics: subscriber.paused_topics || [],
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { token, action, neighborhood_ids, daily_email_enabled, sunday_edition_enabled, paused_topics, suggestion } = body;

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const supabase = getSupabase();
  const subscriber = await findSubscriber(supabase, token);

  if (!subscriber) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  }

  if (action === 'update_neighborhoods') {
    if (subscriber.source === 'newsletter') {
      await supabase
        .from('newsletter_subscribers')
        .update({ neighborhood_ids })
        .eq('unsubscribe_token', token);
    } else {
      // For profiles, update user_neighborhood_preferences
      // Delete existing
      await supabase
        .from('user_neighborhood_preferences')
        .delete()
        .eq('user_id', subscriber.id);

      // Insert new
      if (neighborhood_ids && neighborhood_ids.length > 0) {
        await supabase
          .from('user_neighborhood_preferences')
          .insert(
            neighborhood_ids.map((nid: string) => ({
              user_id: subscriber.id,
              neighborhood_id: nid,
            }))
          );
      }
    }

    // Fire-and-forget: resend today's Daily Brief with updated neighborhoods
    const emailResend = await triggerInstantResend(supabase, subscriber.id, subscriber.source, 'neighborhood_change');

    return NextResponse.json({ success: true, emailResend });
  }

  if (action === 'update_email_enabled') {
    if (subscriber.source === 'newsletter') {
      await supabase
        .from('newsletter_subscribers')
        .update({ daily_email_enabled })
        .eq('unsubscribe_token', token);
    } else {
      await supabase
        .from('profiles')
        .update({ daily_email_enabled })
        .eq('email_unsubscribe_token', token);
    }

    return NextResponse.json({ success: true });
  }

  if (action === 'update_sunday_edition') {
    if (subscriber.source === 'newsletter') {
      await supabase
        .from('newsletter_subscribers')
        .update({ sunday_edition_enabled })
        .eq('unsubscribe_token', token);
    } else {
      await supabase
        .from('profiles')
        .update({ sunday_edition_enabled })
        .eq('email_unsubscribe_token', token);
    }

    return NextResponse.json({ success: true });
  }

  if (action === 'update_topics') {
    if (!Array.isArray(paused_topics)) {
      return NextResponse.json({ error: 'paused_topics must be an array' }, { status: 400 });
    }

    if (subscriber.source === 'newsletter') {
      await supabase
        .from('newsletter_subscribers')
        .update({ paused_topics })
        .eq('unsubscribe_token', token);
    } else {
      await supabase
        .from('profiles')
        .update({ paused_topics })
        .eq('email_unsubscribe_token', token);
    }

    // Fire-and-forget: resend today's Daily Brief with updated topics
    const emailResend = await triggerInstantResend(supabase, subscriber.id, subscriber.source, 'topic_change');

    return NextResponse.json({ success: true, emailResend });
  }

  if (action === 'suggest_topic') {
    if (!suggestion || typeof suggestion !== 'string' || suggestion.trim().length === 0) {
      return NextResponse.json({ error: 'suggestion is required' }, { status: 400 });
    }

    await supabase
      .from('topic_suggestions')
      .insert({
        email: subscriber.email,
        suggestion: suggestion.trim(),
        source: 'preferences',
      });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
