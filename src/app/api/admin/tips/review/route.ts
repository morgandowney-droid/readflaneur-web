import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyTipSubmitterApproved, notifyTipSubmitterRejected } from '@/lib/email';
import type { TipStatus } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { tipId, action, rejectionReason, reviewerNotes } = body;

    if (!tipId) {
      return NextResponse.json({ error: 'Tip ID is required' }, { status: 400 });
    }

    const validActions: TipStatus[] = ['under_review', 'approved', 'rejected', 'converted'];
    if (!action || !validActions.includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: under_review, approved, rejected, or converted' },
        { status: 400 }
      );
    }

    if (action === 'rejected' && !rejectionReason) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 }
      );
    }

    // Fetch tip with neighborhood
    const { data: tip, error: fetchError } = await supabase
      .from('tips')
      .select(`
        *,
        neighborhood:neighborhoods(id, name)
      `)
      .eq('id', tipId)
      .single();

    if (fetchError || !tip) {
      return NextResponse.json({ error: 'Tip not found' }, { status: 404 });
    }

    // Update tip status
    const updateData: Record<string, unknown> = {
      status: action,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    };

    if (rejectionReason) {
      updateData.rejection_reason = rejectionReason;
    }

    if (reviewerNotes) {
      updateData.reviewer_notes = reviewerNotes;
    }

    const { error: updateError } = await supabase
      .from('tips')
      .update(updateData)
      .eq('id', tipId);

    if (updateError) {
      console.error('Tip update error:', updateError);
      return NextResponse.json({ error: 'Failed to update tip' }, { status: 500 });
    }

    // Send email notifications if submitter provided email
    if (tip.submitter_email) {
      const neighborhoodName = tip.neighborhood?.name || 'your neighborhood';

      if (action === 'approved') {
        await notifyTipSubmitterApproved({
          submitter_email: tip.submitter_email,
          submitter_name: tip.submitter_name,
          headline: tip.headline,
          neighborhood_name: neighborhoodName,
        });
      } else if (action === 'rejected') {
        await notifyTipSubmitterRejected({
          submitter_email: tip.submitter_email,
          submitter_name: tip.submitter_name,
          headline: tip.headline,
          rejection_reason: rejectionReason,
        });
      }
    }

    return NextResponse.json({
      success: true,
      action,
      tipId,
    });
  } catch (error) {
    console.error('Tip review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
