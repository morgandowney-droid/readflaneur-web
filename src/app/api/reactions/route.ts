import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const VALID_REACTIONS = ['bookmark', 'heart', 'fire'] as const;

/**
 * GET /api/reactions?articleId=...&anonymousId=...
 * Returns reaction counts and user's own reactions
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get('articleId');
  const anonymousId = searchParams.get('anonymousId');

  if (!articleId) {
    return NextResponse.json({ error: 'articleId required' }, { status: 400 });
  }

  const supabase = await createClient();

  // Get counts per reaction type
  const { data: reactions } = await supabase
    .from('article_reactions')
    .select('reaction_type')
    .eq('article_id', articleId);

  const counts: Record<string, number> = { bookmark: 0, heart: 0, fire: 0 };
  for (const r of reactions || []) {
    counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1;
  }

  // Get user's own reactions
  const userReactions: string[] = [];

  // Check authenticated user
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { data: userReacs } = await supabase
      .from('article_reactions')
      .select('reaction_type')
      .eq('article_id', articleId)
      .eq('user_id', session.user.id);
    for (const r of userReacs || []) {
      userReactions.push(r.reaction_type);
    }
  }

  // Check anonymous reactions
  if (anonymousId) {
    const { data: anonReacs } = await supabase
      .from('article_reactions')
      .select('reaction_type')
      .eq('article_id', articleId)
      .eq('anonymous_id', anonymousId);
    for (const r of anonReacs || []) {
      if (!userReactions.includes(r.reaction_type)) {
        userReactions.push(r.reaction_type);
      }
    }
  }

  return NextResponse.json({ counts, userReactions });
}

/**
 * POST /api/reactions
 * Toggle a reaction on an article
 * Body: { articleId, reactionType, anonymousId? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { articleId, reactionType, anonymousId } = body;

  if (!articleId || !reactionType) {
    return NextResponse.json({ error: 'articleId and reactionType required' }, { status: 400 });
  }

  if (!VALID_REACTIONS.includes(reactionType)) {
    return NextResponse.json({ error: 'Invalid reaction type' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || null;

  if (!userId && !anonymousId) {
    return NextResponse.json({ error: 'Must provide anonymousId for unauthenticated users' }, { status: 400 });
  }

  // Check if reaction already exists
  let existingQuery = supabase
    .from('article_reactions')
    .select('id')
    .eq('article_id', articleId)
    .eq('reaction_type', reactionType);

  if (userId) {
    existingQuery = existingQuery.eq('user_id', userId);
  } else {
    existingQuery = existingQuery.eq('anonymous_id', anonymousId);
  }

  const { data: existing } = await existingQuery.single();

  if (existing) {
    // Remove reaction (toggle off)
    await supabase
      .from('article_reactions')
      .delete()
      .eq('id', existing.id);

    return NextResponse.json({ action: 'removed' });
  }

  // Add reaction (toggle on)
  const { error } = await supabase
    .from('article_reactions')
    .insert({
      article_id: articleId,
      user_id: userId,
      anonymous_id: userId ? null : anonymousId,
      reaction_type: reactionType,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ action: 'added' });
}
