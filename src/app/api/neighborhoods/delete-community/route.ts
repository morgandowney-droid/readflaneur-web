import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const neighborhoodId = body.neighborhoodId?.trim();

    if (!neighborhoodId) {
      return NextResponse.json({ error: 'Neighborhood ID required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Fetch the neighborhood and validate eligibility
    const { data: neighborhood, error: fetchError } = await admin
      .from('neighborhoods')
      .select('id, is_community, created_by, created_at, community_status')
      .eq('id', neighborhoodId)
      .single();

    if (fetchError || !neighborhood) {
      return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
    }

    if (!neighborhood.is_community) {
      return NextResponse.json({ error: 'Only community neighborhoods can be deleted' }, { status: 403 });
    }

    if (neighborhood.created_by !== session.user.id) {
      return NextResponse.json({ error: 'Only the creator can delete this neighborhood' }, { status: 403 });
    }

    if (neighborhood.community_status !== 'active') {
      return NextResponse.json({ error: 'Neighborhood is already removed' }, { status: 400 });
    }

    // Check created_at - must be within 24 hours
    if (!neighborhood.created_at) {
      return NextResponse.json({ error: 'This neighborhood is not eligible for deletion' }, { status: 403 });
    }

    const createdAt = new Date(neighborhood.created_at);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (createdAt < twentyFourHoursAgo) {
      return NextResponse.json({ error: 'Neighborhoods can only be deleted within 24 hours of creation' }, { status: 403 });
    }

    // Check follower count (excluding creator)
    const { count: followerCount } = await admin
      .from('user_neighborhood_preferences')
      .select('id', { count: 'exact', head: true })
      .eq('neighborhood_id', neighborhoodId)
      .neq('user_id', session.user.id);

    if ((followerCount || 0) > 0) {
      return NextResponse.json({ error: 'Cannot delete a neighborhood that has other followers' }, { status: 403 });
    }

    // Soft delete: set community_status = 'removed' and is_active = false
    const { error: updateError } = await admin
      .from('neighborhoods')
      .update({ community_status: 'removed', is_active: false })
      .eq('id', neighborhoodId);

    if (updateError) {
      console.error('Delete community neighborhood error:', updateError);
      return NextResponse.json({ error: 'Failed to delete neighborhood' }, { status: 500 });
    }

    // Clean up: remove from creator's preferences
    await admin
      .from('user_neighborhood_preferences')
      .delete()
      .eq('neighborhood_id', neighborhoodId)
      .eq('user_id', session.user.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete community error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Check eligibility for deletion */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ eligible: {} });
    }

    const admin = getSupabaseAdmin();

    // Get all community neighborhoods created by this user
    const { data: myNeighborhoods } = await admin
      .from('neighborhoods')
      .select('id, created_at')
      .eq('created_by', session.user.id)
      .eq('is_community', true)
      .eq('community_status', 'active');

    if (!myNeighborhoods || myNeighborhoods.length === 0) {
      return NextResponse.json({ eligible: {} });
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const eligible: Record<string, boolean> = {};

    for (const n of myNeighborhoods) {
      // Must have created_at and be within 24h
      if (!n.created_at || new Date(n.created_at) < twentyFourHoursAgo) {
        eligible[n.id] = false;
        continue;
      }

      // Check follower count (excluding creator)
      const { count } = await admin
        .from('user_neighborhood_preferences')
        .select('id', { count: 'exact', head: true })
        .eq('neighborhood_id', n.id)
        .neq('user_id', session.user.id);

      eligible[n.id] = (count || 0) === 0;
    }

    return NextResponse.json({ eligible });
  } catch (err) {
    console.error('Delete eligibility check error:', err);
    return NextResponse.json({ eligible: {} });
  }
}
