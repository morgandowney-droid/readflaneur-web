import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const neighborhoodId = url.searchParams.get('neighborhoodId');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const limit = parseInt(url.searchParams.get('limit') || '5');
  const excludeId = url.searchParams.get('exclude');

  if (!neighborhoodId) {
    return NextResponse.json({ error: 'neighborhoodId required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let query = supabase
    .from('neighborhood_briefs')
    .select('id, headline, content, generated_at, sources, enriched_content, enriched_categories, enriched_at')
    .eq('neighborhood_id', neighborhoodId)
    .order('generated_at', { ascending: false })
    .range(offset, offset + limit);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data: briefs, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Check if there are more
  const { count } = await supabase
    .from('neighborhood_briefs')
    .select('*', { count: 'exact', head: true })
    .eq('neighborhood_id', neighborhoodId);

  const totalExcluding = excludeId ? (count || 0) - 1 : (count || 0);
  const hasMore = offset + limit < totalExcluding;

  return NextResponse.json({
    briefs: briefs || [],
    hasMore,
    total: totalExcluding,
  });
}
