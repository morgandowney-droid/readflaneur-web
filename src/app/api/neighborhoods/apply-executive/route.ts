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
 * /api/neighborhoods/apply-executive:
 *   post:
 *     summary: Apply for executive status
 *     description: Submit an application for executive status to create more than 2 community neighborhoods. One pending application per user.
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
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 1000
 *     responses:
 *       200:
 *         description: Application submitted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Invalid reason (too short or too long)
 *       401:
 *         description: Authentication required
 *       409:
 *         description: A pending application already exists
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const reason = body.reason?.trim();

    if (!reason || reason.length < 10) {
      return NextResponse.json({ error: 'Please provide a reason (at least 10 characters)' }, { status: 400 });
    }

    if (reason.length > 1000) {
      return NextResponse.json({ error: 'Reason is too long (max 1000 characters)' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Check if user already has a pending application
    const { data: existing } = await admin
      .from('executive_applications')
      .select('id, status')
      .eq('user_id', session.user.id)
      .eq('status', 'pending')
      .limit(1)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'You already have a pending application' }, { status: 409 });
    }

    const { error } = await admin
      .from('executive_applications')
      .insert({
        user_id: session.user.id,
        reason,
      });

    if (error) {
      console.error('Executive application insert error:', error);
      return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Executive application error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
