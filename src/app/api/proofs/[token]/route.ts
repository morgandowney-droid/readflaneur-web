import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyAdminChangeRequest } from '@/lib/email';

/**
 * GET /api/proofs/[token] — Fetch ad data for proof page
 * POST /api/proofs/[token] — Approve or request changes
 *
 * No auth required — the proof_token acts as auth.
 */

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = getSupabase();

    const { data: ad, error } = await supabase
      .from('ads')
      .select('id, headline, body, image_url, click_url, sponsor_label, placement_type, status, approval_status, ai_quality_score, ai_flag_reason, ai_suggested_rewrite, original_copy, client_name, client_email, customer_change_request, created_at')
      .eq('proof_token', token)
      .single();

    if (error || !ad) {
      return NextResponse.json({ error: 'Proof not found' }, { status: 404 });
    }

    return NextResponse.json({ ad });
  } catch (error) {
    console.error('Proof GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = getSupabase();

    // Fetch ad
    const { data: ad, error: fetchError } = await supabase
      .from('ads')
      .select('id, headline, client_name, client_email, status, approval_status')
      .eq('proof_token', token)
      .single();

    if (fetchError || !ad) {
      return NextResponse.json({ error: 'Proof not found' }, { status: 404 });
    }

    // Don't allow actions on already-active or rejected ads
    if (ad.status === 'active') {
      return NextResponse.json({ error: 'Ad is already active' }, { status: 400 });
    }
    if (ad.status === 'rejected') {
      return NextResponse.json({ error: 'Ad has been declined' }, { status: 400 });
    }

    const body = await request.json();
    const { action, message } = body;

    if (action === 'approve') {
      const { error: updateError } = await supabase
        .from('ads')
        .update({
          approval_status: 'approved',
          status: 'active',
        })
        .eq('id', ad.id);

      if (updateError) {
        console.error('Proof approve error:', updateError);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'approved' });
    }

    if (action === 'request_changes') {
      if (!message?.trim()) {
        return NextResponse.json({ error: 'Message required' }, { status: 400 });
      }

      const { error: updateError } = await supabase
        .from('ads')
        .update({
          approval_status: 'changes_requested',
          customer_change_request: message.trim(),
        })
        .eq('id', ad.id);

      if (updateError) {
        console.error('Proof change request error:', updateError);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
      }

      // Notify admin
      await notifyAdminChangeRequest({
        adId: ad.id,
        clientName: ad.client_name || 'Client',
        headline: ad.headline || 'Untitled',
        message: message.trim(),
      });

      return NextResponse.json({ success: true, action: 'changes_requested' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Proof POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
