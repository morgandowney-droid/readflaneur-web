import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Check Articles Missing Images
 *
 * GET: Returns count of articles with/without images
 * POST: Tests the flaneur image API connection
 */

const FLANEUR_API_URL = process.env.FLANEUR_API_URL || 'https://flaneur-azure.vercel.app';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Count articles with and without images
  const { data: allArticles, error: allError } = await supabase
    .from('articles')
    .select('id, image_url', { count: 'exact' })
    .eq('status', 'published');

  if (allError) {
    return NextResponse.json({ error: allError.message }, { status: 500 });
  }

  const total = allArticles?.length || 0;
  const withImages = allArticles?.filter(a => a.image_url && a.image_url.length > 0).length || 0;
  const withoutImages = total - withImages;

  // Get sample of articles without images
  const { data: sample } = await supabase
    .from('articles')
    .select('id, headline, neighborhood_id, created_at')
    .eq('status', 'published')
    .or('image_url.is.null,image_url.eq.')
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({
    total,
    withImages,
    withoutImages,
    percentMissing: total > 0 ? Math.round((withoutImages / total) * 100) : 0,
    sampleMissingImages: sample,
    flaneurApiUrl: FLANEUR_API_URL,
    cronSecretConfigured: !!process.env.CRON_SECRET,
  });
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({
      error: 'CRON_SECRET not configured in readflaneur-web',
      hint: 'Add CRON_SECRET to your .env.local file'
    }, { status: 500 });
  }

  // Test the flaneur API connection
  try {
    const testResponse = await fetch(`${FLANEUR_API_URL}/api/regenerate-images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret,
      },
      body: JSON.stringify({
        limit: 0, // Don't actually process anything
      }),
    });

    const responseText = await testResponse.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    return NextResponse.json({
      flaneurApiStatus: testResponse.status,
      flaneurApiOk: testResponse.ok,
      flaneurApiResponse: responseData,
      cronSecretMatch: testResponse.status !== 401,
    });
  } catch (err) {
    return NextResponse.json({
      error: 'Failed to connect to flaneur API',
      details: err instanceof Error ? err.message : 'Unknown error',
      flaneurApiUrl: FLANEUR_API_URL,
    }, { status: 500 });
  }
}
