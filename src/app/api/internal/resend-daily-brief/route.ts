import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { performInstantResend, ResendTrigger } from '@/lib/email/instant-resend';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
