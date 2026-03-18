import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * @swagger
 * /api/advertiser/ads/{id}/toggle:
 *   post:
 *     summary: Toggle ad active/paused status
 *     description: Toggles an ad between active and paused states. Requires session auth and ad ownership.
 *     tags: [Ads]
 *     security:
 *       - session: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ad ID
 *     responses:
 *       200:
 *         description: Toggled status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [active, paused]
 *       401:
 *         description: Not authenticated or not owner
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get current ad status
    const { data: ad, error: fetchError } = await supabase
      .from('ads')
      .select('status')
      .eq('id', adId)
      .eq('advertiser_id', user.id)
      .single();

    if (fetchError || !ad) {
      return NextResponse.json({ error: 'Ad not found' }, { status: 404 });
    }

    const newStatus = ad.status === 'active' ? 'paused' : 'active';

    const { error: updateError } = await supabase
      .from('ads')
      .update({ status: newStatus })
      .eq('id', adId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ status: newStatus });
  } catch (err) {
    console.error('Toggle ad error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
