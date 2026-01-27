import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Alias for /api/cron/publish-scheduled
// Kept for backwards compatibility with existing cron jobs

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization');
    const url = new URL(request.url);
    const querySecret = url.searchParams.get('secret');

    const isAuthorized =
      authHeader === `Bearer ${process.env.CRON_SECRET}` ||
      querySecret === process.env.CRON_SECRET;

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date().toISOString();

    // Find all scheduled articles that should be published
    const { data: articlesToPublish, error: fetchError } = await supabase
      .from('articles')
      .select('id, headline')
      .eq('status', 'scheduled')
      .lte('scheduled_for', now);

    if (fetchError) {
      console.error('Fetch scheduled articles error:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!articlesToPublish || articlesToPublish.length === 0) {
      return NextResponse.json({ message: 'No articles to publish', count: 0 });
    }

    // Publish each article
    const articleIds = articlesToPublish.map(a => a.id);

    const { error: updateError } = await supabase
      .from('articles')
      .update({
        status: 'published',
        published_at: now,
      })
      .in('id', articleIds);

    if (updateError) {
      console.error('Publish articles error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log(`Published ${articlesToPublish.length} scheduled articles:`,
      articlesToPublish.map(a => a.headline).join(', '));

    return NextResponse.json({
      message: 'Published scheduled articles',
      count: articlesToPublish.length,
      articles: articlesToPublish.map(a => ({ id: a.id, headline: a.headline })),
    });
  } catch (err) {
    console.error('Cron publish error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
// force rebuild
