import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const neighborhoodId = request.nextUrl.searchParams.get('id');
    if (!neighborhoodId) {
      return NextResponse.json({ error: 'Missing neighborhood id' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: existing } = await supabaseAdmin
      .from('agent_partners')
      .select('id, agent_name')
      .eq('neighborhood_id', neighborhoodId)
      .in('status', ['setup', 'active'])
      .limit(1);

    return NextResponse.json({
      available: !existing || existing.length === 0,
      takenBy: existing?.[0]?.agent_name || null,
    });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
