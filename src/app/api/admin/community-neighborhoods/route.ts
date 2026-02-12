import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return profile?.role === 'admin' ? user : null;
}

export async function GET() {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: neighborhoods, error } = await getSupabaseAdmin()
      .from('neighborhoods')
      .select('id, name, city, country, region, timezone, is_active, is_community, created_by, community_status, created_at')
      .eq('is_community', true)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Community neighborhoods fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }

    // Fetch creator emails
    const creatorIds = [...new Set((neighborhoods || []).map(n => n.created_by).filter(Boolean))];
    let creatorEmails: Record<string, string> = {};

    if (creatorIds.length > 0) {
      const { data: profiles } = await getSupabaseAdmin()
        .from('profiles')
        .select('id, email')
        .in('id', creatorIds);

      if (profiles) {
        creatorEmails = Object.fromEntries(profiles.map(p => [p.id, p.email]));
      }
    }

    const enriched = (neighborhoods || []).map(n => ({
      ...n,
      creator_email: n.created_by ? creatorEmails[n.created_by] || null : null,
    }));

    return NextResponse.json({ neighborhoods: enriched });
  } catch (error) {
    console.error('Admin community neighborhoods error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, community_status } = body as {
      id: string;
      community_status: 'active' | 'removed';
    };

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    if (!['active', 'removed'].includes(community_status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const { error } = await getSupabaseAdmin()
      .from('neighborhoods')
      .update({
        community_status,
        is_active: community_status === 'active',
      })
      .eq('id', id)
      .eq('is_community', true);

    if (error) {
      console.error('Community neighborhood update error:', error);
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin community neighborhood update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
