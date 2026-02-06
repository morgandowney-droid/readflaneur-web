import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    .select('id, email, neighborhood_ids, daily_email_enabled, unsubscribe_token')
    .eq('unsubscribe_token', token)
    .single();

  if (subscriber) {
    return { ...subscriber, source: 'newsletter' as const };
  }

  // Try profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, primary_city, daily_email_enabled, email_unsubscribe_token')
    .eq('email_unsubscribe_token', token)
    .single();

  if (profile) {
    // Fetch user's neighborhood preferences
    const { data: prefs } = await supabase
      .from('user_neighborhood_preferences')
      .select('neighborhood_id')
      .eq('user_id', profile.id);

    return {
      ...profile,
      source: 'profile' as const,
      neighborhood_ids: (prefs || []).map(p => p.neighborhood_id),
    };
  }

  return null;
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
    .select('id, name, city, region')
    .order('city')
    .order('name');

  return NextResponse.json({
    email: subscriber.email,
    source: subscriber.source,
    daily_email_enabled: subscriber.daily_email_enabled,
    neighborhood_ids: neighborhoodIds,
    neighborhoods,
    primary_city: subscriber.source === 'profile' ? (subscriber as { primary_city?: string }).primary_city : null,
    all_neighborhoods: allNeighborhoods || [],
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { token, action, neighborhood_ids, daily_email_enabled } = body;

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

    return NextResponse.json({ success: true });
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

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
