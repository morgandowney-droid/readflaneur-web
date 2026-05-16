import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { activatePartner } from '@/lib/partner-activation';

/**
 * @swagger
 * /api/partner/activate:
 *   post:
 *     tags: [Internal]
 *     summary: Free "Founding Partner" activation
 *     description: Activates an agent partner with no payment (plan='free'). The no-Stripe path out of the /partner setup flow during the beta.
 *     responses:
 *       200:
 *         description: Activated (or already active)
 *       404:
 *         description: Partner not found
 */
export async function POST(request: NextRequest) {
  try {
    const { agentPartnerId } = await request.json();

    if (!agentPartnerId) {
      return NextResponse.json({ error: 'Missing agentPartnerId' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: partner } = await supabaseAdmin
      .from('agent_partners')
      .select('id, status')
      .eq('id', agentPartnerId)
      .single();

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    if (partner.status === 'active') {
      return NextResponse.json({ success: true, alreadyActive: true });
    }

    const result = await activatePartner(supabaseAdmin, agentPartnerId);
    if (!result.ok) {
      return NextResponse.json(
        { error: 'Activation failed. Please try again.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Partner activate error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
