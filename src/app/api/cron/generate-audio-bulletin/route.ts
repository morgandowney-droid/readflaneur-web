/**
 * Generate Audio Bulletin Cron
 *
 * Generates a 2-minute news bulletin script for yous.news every hour at :55.
 * Reads the yous.news homepage content + last 3 bulletins for continuity,
 * writes the script with phonetic pronunciation guides via Gemini Flash
 * with Google Search grounding.
 *
 * Schedule: 55 * * * * (every hour at :55)
 * Cost: ~$0.15/day (24 Gemini Flash calls with search grounding)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import {
  fetchYousNewsStories,
  fetchRecentBulletins,
  generateBulletinScript,
  type BulletinResult,
} from '@/lib/audio-bulletin';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/cron/generate-audio-bulletin:
 *   get:
 *     tags: [Cron]
 *     summary: Generate hourly audio bulletin script for yous.news
 *     description: Runs at :55 every hour. Fetches yous.news stories and recent bulletins, generates a 2-minute script with phonetic pronunciations via Gemini Flash.
 *     security:
 *       - cronSecret: []
 *     responses:
 *       200:
 *         description: Bulletin generated successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Generation failed
 */
export async function GET(request: Request) {
  const startTime = Date.now();

  // Auth
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const providedSecret = authHeader?.replace('Bearer ', '') || url.searchParams.get('secret');

  if (!cronHeader && (!cronSecret || providedSecret !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Determine the hour this bulletin is for (the next hour)
  const now = new Date();
  const irishNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Dublin' }));
  const nextHour = (irishNow.getHours() + 1) % 24;
  const currentHour = nextHour.toString().padStart(2, '0');
  // For display: "7" not "07"
  const hourDisplay = nextHour === 0 ? '12' : nextHour > 12 ? (nextHour - 12).toString() : nextHour.toString();

  let bulletin: BulletinResult | null = null;

  try {
    // Fetch inputs in parallel
    const [stories, recentBulletins] = await Promise.all([
      fetchYousNewsStories(),
      fetchRecentBulletins(3),
    ]);

    const genAI = new GoogleGenAI({ apiKey });

    bulletin = await generateBulletinScript(
      genAI,
      stories,
      recentBulletins,
      hourDisplay,
    );

    if (!bulletin) {
      throw new Error('Gemini returned empty bulletin');
    }

    // Store in Supabase for the GET endpoint to serve
    const { error: upsertError } = await supabase
      .from('audio_bulletin_scripts')
      .upsert(
        {
          hour: currentHour,
          script: bulletin.script,
          pronunciations: bulletin.pronunciations,
          story_count: bulletin.story_count,
          generated_at: bulletin.generated_at,
          bulletin_date: irishNow.toISOString().split('T')[0],
        },
        { onConflict: 'bulletin_date,hour' }
      );

    if (upsertError) {
      console.error('Failed to store bulletin:', upsertError);
    }

    // Log to cron_executions
    const elapsed = Date.now() - startTime;
    await supabase.from('cron_executions').insert({
      cron_name: 'generate-audio-bulletin',
      status: 'success',
      duration_ms: elapsed,
      items_processed: bulletin.story_count,
      response_data: {
        hour: currentHour,
        story_count: bulletin.story_count,
        pronunciation_count: Object.keys(bulletin.pronunciations).length,
        stories_from_api: stories.length,
        recent_bulletins_fetched: recentBulletins.length,
      },
    }).then(null, (e: Error) => console.error('Failed to log cron:', e));

    return NextResponse.json({
      success: true,
      hour: currentHour,
      story_count: bulletin.story_count,
      pronunciation_count: Object.keys(bulletin.pronunciations).length,
      duration_ms: elapsed,
    });

  } catch (err: unknown) {
    const elapsed = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);

    await supabase.from('cron_executions').insert({
      cron_name: 'generate-audio-bulletin',
      status: 'error',
      duration_ms: elapsed,
      response_data: { error: message, hour: currentHour },
    }).then(null, () => {});

    return NextResponse.json(
      { error: 'Bulletin generation failed', detail: message },
      { status: 500 }
    );
  }
}
