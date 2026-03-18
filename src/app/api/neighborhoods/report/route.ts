import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * @swagger
 * /api/neighborhoods/report:
 *   post:
 *     summary: Report a community neighborhood
 *     description: Submit a report for a community neighborhood. One report per user per neighborhood.
 *     tags:
 *       - Community
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - neighborhoodId
 *               - reason
 *             properties:
 *               neighborhoodId:
 *                 type: string
 *               reason:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Report submitted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Missing fields or reason too short
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Neighborhood not found
 *       409:
 *         description: Already reported by this user
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const neighborhoodId = body.neighborhoodId?.trim();
    const reason = body.reason?.trim();

    if (!neighborhoodId) {
      return NextResponse.json({ error: 'Neighborhood ID required' }, { status: 400 });
    }

    if (!reason || reason.length < 3) {
      return NextResponse.json({ error: 'Please provide a reason' }, { status: 400 });
    }

    if (reason.length > 500) {
      return NextResponse.json({ error: 'Reason is too long (max 500 characters)' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Verify the neighborhood exists and is a community neighborhood
    const { data: neighborhood } = await admin
      .from('neighborhoods')
      .select('id, is_community, created_by')
      .eq('id', neighborhoodId)
      .single();

    if (!neighborhood) {
      return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
    }

    if (!neighborhood.is_community) {
      return NextResponse.json({ error: 'Only community neighborhoods can be reported' }, { status: 400 });
    }

    if (neighborhood.created_by === session.user.id) {
      return NextResponse.json({ error: 'You cannot report your own neighborhood' }, { status: 400 });
    }

    // Insert report (unique constraint prevents duplicates)
    const { error } = await admin
      .from('neighborhood_reports')
      .insert({
        neighborhood_id: neighborhoodId,
        reporter_id: session.user.id,
        reason,
      });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'You have already reported this neighborhood' }, { status: 409 });
      }
      console.error('Report insert error:', error);
      return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Report neighborhood error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
