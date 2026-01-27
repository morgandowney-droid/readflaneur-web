import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { createHash } from 'crypto';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Hash IP for privacy
function hashIP(ip: string): string {
  return createHash('sha256').update(ip + process.env.CRON_SECRET).digest('hex').slice(0, 16);
}

// Check for blocked words
async function checkBlockedWords(content: string, supabase: any): Promise<{ blocked: boolean; flagged: boolean; word?: string }> {
  const { data: blockedWords } = await supabase
    .from('blocked_words')
    .select('word, severity');

  if (!blockedWords) return { blocked: false, flagged: false };

  const contentLower = content.toLowerCase();

  for (const { word, severity } of blockedWords) {
    if (contentLower.includes(word.toLowerCase())) {
      if (severity === 'block') {
        return { blocked: true, flagged: false, word };
      }
      if (severity === 'flag') {
        return { blocked: false, flagged: true, word };
      }
    }
  }

  return { blocked: false, flagged: false };
}

// OpenAI moderation check
async function moderateContent(content: string): Promise<{
  flagged: boolean;
  categories: Record<string, boolean>;
  scores: Record<string, number>;
}> {
  try {
    const response = await openai.moderations.create({
      input: content,
    });

    const result = response.results[0];
    return {
      flagged: result.flagged,
      categories: result.categories as unknown as Record<string, boolean>,
      scores: result.category_scores as unknown as Record<string, number>,
    };
  } catch (error) {
    console.error('OpenAI moderation error:', error);
    // If moderation fails, flag for manual review
    return { flagged: true, categories: {}, scores: {} };
  }
}

// GET - Fetch comments for an article
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get('articleId');

  if (!articleId) {
    return NextResponse.json({ error: 'articleId required' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: comments, error } = await supabase
    .from('comments')
    .select(`
      id,
      content,
      author_name,
      parent_id,
      created_at,
      user_id
    `)
    .eq('article_id', articleId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get vote counts for each comment
  const commentIds = comments?.map(c => c.id) || [];

  const { data: votes } = await supabase
    .from('comment_votes')
    .select('comment_id, vote_type')
    .in('comment_id', commentIds);

  // Calculate vote counts
  const voteCounts: Record<string, { up: number; down: number }> = {};
  votes?.forEach(vote => {
    if (!voteCounts[vote.comment_id]) {
      voteCounts[vote.comment_id] = { up: 0, down: 0 };
    }
    voteCounts[vote.comment_id][vote.vote_type as 'up' | 'down']++;
  });

  // Attach vote counts to comments
  const commentsWithVotes = comments?.map(comment => ({
    ...comment,
    votes: voteCounts[comment.id] || { up: 0, down: 0 },
  }));

  return NextResponse.json({ comments: commentsWithVotes });
}

// POST - Create a new comment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { articleId, content, authorName, authorEmail, parentId } = body;

    if (!articleId || !content || !authorName) {
      return NextResponse.json(
        { error: 'articleId, content, and authorName are required' },
        { status: 400 }
      );
    }

    // Validate content length
    if (content.length > 2000) {
      return NextResponse.json(
        { error: 'Comment too long (max 2000 characters)' },
        { status: 400 }
      );
    }

    if (content.length < 2) {
      return NextResponse.json(
        { error: 'Comment too short' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get IP for spam prevention
    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const ipHash = hashIP(ip);

    // Check for rate limiting (max 5 comments per IP per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentComments } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', oneHourAgo);

    if (recentComments && recentComments >= 5) {
      return NextResponse.json(
        { error: 'Too many comments. Please wait before posting again.' },
        { status: 429 }
      );
    }

    // Check blocked words first (fast, local check)
    const blockedCheck = await checkBlockedWords(content, supabase);
    if (blockedCheck.blocked) {
      return NextResponse.json(
        { error: 'Your comment contains inappropriate content and cannot be posted.' },
        { status: 400 }
      );
    }

    // Run OpenAI moderation
    const moderation = await moderateContent(content);

    // Determine status based on moderation
    let status: 'approved' | 'pending' | 'flagged' = 'approved';

    if (moderation.flagged || blockedCheck.flagged) {
      // Check severity - some categories get auto-rejected, others flagged for review
      const severeCategories = ['sexual/minors', 'violence/graphic', 'self-harm'];
      const hasSevere = severeCategories.some(cat => moderation.categories[cat]);

      if (hasSevere) {
        return NextResponse.json(
          { error: 'Your comment violates our community guidelines.' },
          { status: 400 }
        );
      }

      // Flag for manual review
      status = 'flagged';
    }

    // Get user if logged in
    const { data: { user } } = await supabase.auth.getUser();

    // Insert comment
    const { data: comment, error } = await supabase
      .from('comments')
      .insert({
        article_id: articleId,
        user_id: user?.id || null,
        parent_id: parentId || null,
        author_name: authorName.slice(0, 50),
        author_email: authorEmail?.slice(0, 100) || null,
        content: content.trim(),
        status,
        moderation_score: moderation.flagged ? Math.max(...Object.values(moderation.scores)) : 0,
        moderation_categories: moderation.flagged ? moderation.categories : null,
        ip_hash: ipHash,
      })
      .select()
      .single();

    if (error) {
      console.error('Comment insert error:', error);
      return NextResponse.json({ error: 'Failed to post comment' }, { status: 500 });
    }

    // Return different message based on status
    if (status === 'flagged') {
      return NextResponse.json({
        success: true,
        message: 'Your comment has been submitted and is awaiting review.',
        comment: null,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Comment posted successfully.',
      comment: {
        id: comment.id,
        content: comment.content,
        author_name: comment.author_name,
        created_at: comment.created_at,
        votes: { up: 0, down: 0 },
      },
    });
  } catch (error) {
    console.error('Comment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
