import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';

function hashIP(ip: string): string {
  return createHash('sha256').update(ip + process.env.CRON_SECRET).digest('hex').slice(0, 16);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { commentId, voteType } = body;

    if (!commentId || !['up', 'down'].includes(voteType)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const ipHash = hashIP(ip);

    // Check if already voted
    let existingVote;

    if (user) {
      const { data } = await supabase
        .from('comment_votes')
        .select('*')
        .eq('comment_id', commentId)
        .eq('user_id', user.id)
        .single();
      existingVote = data;
    } else {
      const { data } = await supabase
        .from('comment_votes')
        .select('*')
        .eq('comment_id', commentId)
        .eq('ip_hash', ipHash)
        .single();
      existingVote = data;
    }

    if (existingVote) {
      if (existingVote.vote_type === voteType) {
        // Remove vote if clicking same button
        await supabase
          .from('comment_votes')
          .delete()
          .eq('id', existingVote.id);

        return NextResponse.json({ success: true, action: 'removed' });
      } else {
        // Change vote
        await supabase
          .from('comment_votes')
          .update({ vote_type: voteType })
          .eq('id', existingVote.id);

        return NextResponse.json({ success: true, action: 'changed' });
      }
    }

    // Create new vote
    const { error } = await supabase
      .from('comment_votes')
      .insert({
        comment_id: commentId,
        user_id: user?.id || null,
        ip_hash: user ? null : ipHash,
        vote_type: voteType,
      });

    if (error) {
      console.error('Vote error:', error);
      return NextResponse.json({ error: 'Failed to vote' }, { status: 500 });
    }

    return NextResponse.json({ success: true, action: 'voted' });
  } catch (error) {
    console.error('Vote error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
