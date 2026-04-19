import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Check whether a neighborhood is available for a prospective broker.
 *
 * Treats a neighborhood as AVAILABLE when:
 *  - No existing setup/active row, OR
 *  - The only row is owned by the viewer (matched by optional `?email=`), OR
 *  - The only row is a stale abandoned setup (>STALE_SETUP_HOURS old, no
 *    stripe_customer_id = checkout never started). We also auto-delete these
 *    so subsequent checks don't repeat the work.
 *
 * This prevents the "one back-click puts a broker in limbo" failure mode where
 * an abandoned setup row locked the neighborhood forever.
 */
const STALE_SETUP_HOURS = 24;

export async function GET(request: NextRequest) {
  try {
    const neighborhoodId = request.nextUrl.searchParams.get('id');
    const viewerEmail = request.nextUrl.searchParams.get('email')?.toLowerCase().trim() || null;

    if (!neighborhoodId) {
      return NextResponse.json({ error: 'Missing neighborhood id' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: rows } = await supabaseAdmin
      .from('agent_partners')
      .select('id, agent_name, agent_email, status, stripe_customer_id, created_at, updated_at')
      .eq('neighborhood_id', neighborhoodId)
      .in('status', ['setup', 'active']);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ available: true, takenBy: null });
    }

    const staleCutoffMs = Date.now() - STALE_SETUP_HOURS * 60 * 60 * 1000;
    const staleIds: string[] = [];
    let blocker: { id: string; agent_name: string; agent_email: string } | null = null;

    for (const row of rows) {
      // Same-email viewer always treated as available (resume own setup)
      if (viewerEmail && row.agent_email?.toLowerCase() === viewerEmail) {
        continue;
      }
      // Abandoned setup: never reached checkout and >24h old → release
      const ref = new Date(row.updated_at || row.created_at).getTime();
      if (row.status === 'setup' && !row.stripe_customer_id && ref < staleCutoffMs) {
        staleIds.push(row.id);
        continue;
      }
      // Real blocker
      blocker = { id: row.id, agent_name: row.agent_name, agent_email: row.agent_email };
      break;
    }

    // Garbage-collect stale rows so they don't block anyone next time
    if (staleIds.length > 0 && !blocker) {
      await supabaseAdmin.from('agent_partners').delete().in('id', staleIds);
    }

    if (blocker) {
      return NextResponse.json({ available: false, takenBy: blocker.agent_name });
    }

    return NextResponse.json({ available: true, takenBy: null });
  } catch (err) {
    console.error('check-neighborhood error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
