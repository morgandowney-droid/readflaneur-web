import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Retry Missing Images
 *
 * Calls /api/internal/generate-image to fill in articles that are
 * missing images (failed on first attempt during article creation).
 *
 * Schedule: Every 2 hours
 */

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-vercel-cron') === '1' ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const startedAt = new Date().toISOString();
  let success = false;
  let responseData: Record<string, unknown> = {};
  const errors: string[] = [];

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\n$/, '').replace(/\/$/, '')
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const res = await fetch(`${baseUrl}/api/internal/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret || '',
      },
      body: JSON.stringify({ limit: 10 }),
    });

    const data = await res.json();

    if (!res.ok) {
      errors.push(`generate-image returned ${res.status}: ${data.error || 'Unknown error'}`);
    } else {
      success = true;
      responseData = data;
    }

    return NextResponse.json({
      success,
      ...data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    errors.push(message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await supabase.from('cron_executions').insert({
      job_name: 'retry-missing-images',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      success,
      errors: errors.length > 0 ? errors : null,
      response_data: Object.keys(responseData).length > 0 ? responseData : null,
    }).then(null, (e: unknown) => console.error('Failed to log cron execution:', e));
  }
}
