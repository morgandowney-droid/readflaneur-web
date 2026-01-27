import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const neighborhoodId = searchParams.get('neighborhood_id');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query
    let query = supabase
      .from('tips')
      .select(`
        *,
        neighborhood:neighborhoods(id, name, city),
        user:profiles!tips_user_id_fkey(id, email, full_name),
        reviewer:profiles!tips_reviewed_by_fkey(id, email, full_name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (neighborhoodId) {
      query = query.eq('neighborhood_id', neighborhoodId);
    }

    const { data: tips, error, count } = await query;

    if (error) {
      console.error('Tips fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch tips' }, { status: 500 });
    }

    return NextResponse.json({
      tips,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Admin tips error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
