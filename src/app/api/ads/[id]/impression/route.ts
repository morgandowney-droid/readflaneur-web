import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;
    const supabase = await createClient();

    // Increment impression count
    const { error } = await supabase.rpc('increment_ad_impressions', { ad_id: adId });

    if (error) {
      // Fallback to manual increment if RPC doesn't exist
      const { data: ad } = await supabase
        .from('ads')
        .select('impressions')
        .eq('id', adId)
        .single();

      if (ad) {
        await supabase
          .from('ads')
          .update({ impressions: (ad.impressions || 0) + 1 })
          .eq('id', adId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Impression tracking error:', err);
    // Return success anyway to not break the user experience
    return NextResponse.json({ success: true });
  }
}
