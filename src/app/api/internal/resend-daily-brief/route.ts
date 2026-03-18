import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { performInstantResend, ResendTrigger } from '@/lib/email/instant-resend';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * @swagger
 * /api/internal/resend-daily-brief:
 *   post:
 *     summary: Trigger instant resend of daily brief email
 *     description: Resends the daily brief email to a user, typically triggered by a neighborhood or city change. Requires cron secret auth.
 *     tags: [Internal]
 *     security:
 *       - cronSecret: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, source, trigger]
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *               source:
 *                 type: string
 *               trigger:
 *                 type: string
 *                 enum: [city_change, neighborhood_change, topic_change]
 *     responses:
 *       200:
 *         description: Resend result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 reason:
 *                   type: string
 *                 details:
 *                   type: object
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-cron-secret') === cronSecret ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized && cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { userId, source, trigger } = await request.json();

    if (!userId || !source || !trigger) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, source, trigger' },
        { status: 400 }
      );
    }

    const validTriggers: ResendTrigger[] = ['city_change', 'neighborhood_change', 'topic_change'];
    if (!validTriggers.includes(trigger)) {
      return NextResponse.json(
        { error: `Invalid trigger. Must be one of: ${validTriggers.join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const result = await performInstantResend(supabase, { userId, source, trigger });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Resend daily brief endpoint error:', error);
    return NextResponse.json(
      { success: false, reason: 'error', error: (error as Error).message },
      { status: 500 }
    );
  }
}
