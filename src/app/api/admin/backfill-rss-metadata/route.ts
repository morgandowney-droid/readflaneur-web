import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Backfill RSS Article Metadata
 *
 * Updates existing articles that were sourced from RSS feeds but
 * are missing proper metadata (author_type, ai_model, category_label).
 *
 * RSS articles are identified by editor_notes starting with "Source:"
 *
 * GET: Preview what would be updated (dry run)
 * POST: Actually perform the update
 */

export async function GET(request: NextRequest) {
  return handleBackfill(request, true);
}

export async function POST(request: NextRequest) {
  return handleBackfill(request, false);
}

async function handleBackfill(request: NextRequest, dryRun: boolean) {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use service role for admin operations
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

    // Check authentication and admin role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Find RSS articles missing proper metadata
    // RSS articles have editor_notes like "Source: Gothamist - https://..."
    const { data: articlesToFix, error: fetchError } = await supabase
      .from('articles')
      .select('id, headline, editor_notes, author_type, ai_model, category_label, created_at')
      .like('editor_notes', 'Source:%')
      .or('author_type.is.null,author_type.eq.human')
      .order('created_at', { ascending: false })
      .limit(500);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!articlesToFix || articlesToFix.length === 0) {
      return NextResponse.json({
        message: 'No RSS articles found needing metadata update',
        count: 0,
        dryRun,
      });
    }

    // Filter to only those missing the metadata we want to set
    const needsUpdate = articlesToFix.filter(a =>
      a.author_type !== 'ai' ||
      a.ai_model !== 'claude-sonnet-4-5' ||
      a.category_label !== 'News Brief'
    );

    if (dryRun) {
      return NextResponse.json({
        message: 'Dry run - no changes made',
        dryRun: true,
        articlesToUpdate: needsUpdate.length,
        preview: needsUpdate.slice(0, 10).map(a => ({
          id: a.id,
          headline: a.headline.slice(0, 60) + (a.headline.length > 60 ? '...' : ''),
          currentAuthorType: a.author_type,
          currentAiModel: a.ai_model,
          currentCategory: a.category_label,
          source: a.editor_notes?.slice(0, 100),
        })),
      });
    }

    // Perform the update
    let updated = 0;
    let errors: string[] = [];

    for (const article of needsUpdate) {
      const { error: updateError } = await supabase
        .from('articles')
        .update({
          author_type: 'ai',
          ai_model: 'claude-sonnet-4-5',
          category_label: 'News Brief',
        })
        .eq('id', article.id);

      if (updateError) {
        errors.push(`${article.id}: ${updateError.message}`);
      } else {
        updated++;
      }
    }

    return NextResponse.json({
      message: `Backfill complete`,
      dryRun: false,
      articlesFound: needsUpdate.length,
      articlesUpdated: updated,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (err) {
    console.error('Backfill RSS metadata error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
