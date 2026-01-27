import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ads: [], error: 'Not authenticated' }, { status: 401 });
    }

    const { data: ads, error: adsError } = await supabase
      .from('ads')
      .select('*')
      .eq('advertiser_id', user.id)
      .order('created_at', { ascending: false });

    if (adsError) {
      console.error('Error fetching ads:', adsError);
      return NextResponse.json({ ads: [], error: adsError.message }, { status: 500 });
    }

    return NextResponse.json({ ads: ads || [], user });
  } catch (err) {
    console.error('Advertiser ads API error:', err);
    return NextResponse.json({ ads: [], error: 'Internal error' }, { status: 500 });
  }
}
