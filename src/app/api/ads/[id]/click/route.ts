import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;
    const supabase = await createClient();

    // Increment click count
    const { error } = await supabase.rpc('increment_ad_clicks', { ad_id: adId });

    if (error) {
      // Fallback to manual increment if RPC doesn't exist
      const { data: ad } = await supabase
        .from('ads')
        .select('clicks')
        .eq('id', adId)
        .single();

      if (ad) {
        await supabase
          .from('ads')
          .update({ clicks: (ad.clicks || 0) + 1 })
          .eq('id', adId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Click tracking error:', err);
    // Return success anyway to not break the user experience
    return NextResponse.json({ success: true });
  }
}
