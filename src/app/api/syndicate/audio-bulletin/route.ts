/**
 * Audio Bulletin Syndication Endpoint
 *
 * GET /api/syndicate/audio-bulletin
 *
 * Returns the latest generated bulletin script for yous.news to consume.
 * yous.news polls this at the top of every hour, applies its own SSML
 * processing pipeline, and generates audio via Azure TTS.
 *
 * Response format:
 * {
 *   "script": "From yous.news, here is the news...",
 *   "pronunciations": { "Taoiseach": "TEE-shuck", ... },
 *   "story_count": 5,
 *   "generated_at": "2026-03-22T14:55:00Z",
 *   "hour": "15"
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/syndicate/audio-bulletin:
 *   get:
 *     tags: [Internal]
 *     summary: Get latest audio bulletin script
 *     description: Returns the most recent bulletin script with phonetic pronunciations. Secured by CRON_SECRET. yous.news polls this endpoint at the top of every hour.
 *     security:
 *       - cronSecret: []
 *     parameters:
 *       - in: query
 *         name: hour
 *         schema:
 *           type: string
 *         description: Specific hour to fetch (00-23). Defaults to current Irish hour.
 *       - in: query
 *         name: lang
 *         schema:
 *           type: string
 *           enum: [en, ga]
 *         description: Language (en=English, ga=Irish). Currently only English is generated.
 *     responses:
 *       200:
 *         description: Latest bulletin script
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 script:
 *                   type: string
 *                 pronunciations:
 *                   type: object
 *                 story_count:
 *                   type: number
 *                 generated_at:
 *                   type: string
 *                 hour:
 *                   type: string
 *       401:
 *         description: Invalid or missing secret
 *       404:
 *         description: No bulletin available for this hour
 */
export async function GET(request: NextRequest) {
  // Auth
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = authHeader?.replace('Bearer ', '') ||
    request.nextUrl.searchParams.get('secret');

  if (!cronSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Language param - currently only English generated
  const lang = request.nextUrl.searchParams.get('lang') || 'en';
  if (lang !== 'en') {
    return NextResponse.json(
      { error: 'Only English (en) bulletins available', lang },
      { status: 404 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Determine which hour to fetch - always use Irish timezone
  const now = new Date();
  const targetDate = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' });

  const requestedHour = request.nextUrl.searchParams.get('hour');
  let targetHour: string;

  if (requestedHour) {
    targetHour = requestedHour.padStart(2, '0');
  } else {
    // Default: current Irish hour
    const irishHour = parseInt(now.toLocaleString('en-US', { timeZone: 'Europe/Dublin', hour: 'numeric', hour12: false }));
    targetHour = irishHour.toString().padStart(2, '0');
  }

  // Fetch the bulletin for this hour
  const { data: bulletin, error } = await supabase
    .from('audio_bulletin_scripts')
    .select('script, pronunciations, story_count, generated_at, hour')
    .eq('bulletin_date', targetDate)
    .eq('hour', targetHour)
    .single();

  if (error || !bulletin) {
    // Try the most recent bulletin from today as fallback
    const { data: latest } = await supabase
      .from('audio_bulletin_scripts')
      .select('script, pronunciations, story_count, generated_at, hour')
      .eq('bulletin_date', targetDate)
      .order('hour', { ascending: false })
      .limit(1)
      .single();

    if (latest) {
      return NextResponse.json(latest, {
        headers: {
          'Cache-Control': 'private, max-age=60',
          'X-Bulletin-Fallback': 'true',
        },
      });
    }

    return NextResponse.json(
      { error: 'No bulletin available', hour: targetHour, date: targetDate },
      { status: 404 }
    );
  }

  return NextResponse.json(bulletin, {
    headers: {
      'Cache-Control': 'private, max-age=120',
    },
  });
}
