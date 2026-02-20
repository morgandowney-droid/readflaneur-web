import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/image-feedback?imageUrl=...&anonymousId=...
 * Returns aggregate score and user's own feedback for an image
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('imageUrl');
  const anonymousId = searchParams.get('anonymousId');

  if (!imageUrl) {
    return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });
  }

  const supabase = await createClient();

  // Get aggregate score
  const { data: rows } = await supabase
    .from('image_feedback')
    .select('feedback')
    .eq('image_url', imageUrl);

  const score = (rows || []).reduce((sum, r) => sum + r.feedback, 0);

  // Get user's own feedback
  let userFeedback: number | null = null;

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { data: row } = await supabase
      .from('image_feedback')
      .select('feedback')
      .eq('image_url', imageUrl)
      .eq('user_id', session.user.id)
      .single();
    if (row) userFeedback = row.feedback;
  }

  if (!userFeedback && anonymousId) {
    const { data: row } = await supabase
      .from('image_feedback')
      .select('feedback')
      .eq('image_url', imageUrl)
      .eq('anonymous_id', anonymousId)
      .single();
    if (row) userFeedback = row.feedback;
  }

  return NextResponse.json({ score, userFeedback });
}

/**
 * POST /api/image-feedback
 * Submit image feedback (thumbs up/down)
 * Body: { imageUrl, feedback: 1 | -1, anonymousId? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { imageUrl, feedback, anonymousId } = body;

  if (!imageUrl || (feedback !== 1 && feedback !== -1)) {
    return NextResponse.json({ error: 'imageUrl and feedback (1 or -1) required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || null;

  if (!userId && !anonymousId) {
    return NextResponse.json({ error: 'Must provide anonymousId for unauthenticated users' }, { status: 400 });
  }

  // Check for existing feedback
  let existingQuery = supabase
    .from('image_feedback')
    .select('id, feedback')
    .eq('image_url', imageUrl);

  if (userId) {
    existingQuery = existingQuery.eq('user_id', userId);
  } else {
    existingQuery = existingQuery.eq('anonymous_id', anonymousId);
  }

  const { data: existing } = await existingQuery.single();

  let action: 'added' | 'switched' | 'removed';

  if (existing) {
    if (existing.feedback === feedback) {
      // Same feedback — toggle off (remove)
      await supabase
        .from('image_feedback')
        .delete()
        .eq('id', existing.id);
      action = 'removed';
    } else {
      // Opposite feedback — switch
      await supabase
        .from('image_feedback')
        .update({ feedback })
        .eq('id', existing.id);
      action = 'switched';
    }
  } else {
    // No existing — insert
    const { error } = await supabase
      .from('image_feedback')
      .insert({
        image_url: imageUrl,
        feedback,
        user_id: userId,
        anonymous_id: userId ? null : anonymousId,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    action = 'added';
  }

  // Return updated score
  const { data: rows } = await supabase
    .from('image_feedback')
    .select('feedback')
    .eq('image_url', imageUrl);

  const score = (rows || []).reduce((sum, r) => sum + r.feedback, 0);

  return NextResponse.json({ action, score });
}
