import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/';
  const neighborhoodsParam = requestUrl.searchParams.get('neighborhoods');

  if (code) {
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

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // Save neighborhood preferences if provided
      if (neighborhoodsParam) {
        try {
          const neighborhoodIds = JSON.parse(decodeURIComponent(neighborhoodsParam));
          if (Array.isArray(neighborhoodIds) && neighborhoodIds.length > 0) {
            // Use admin client to bypass RLS
            const supabaseAdmin = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!
            );

            // Insert neighborhood preferences
            const prefsToInsert = neighborhoodIds.map((nId: string) => ({
              user_id: data.session.user.id,
              neighborhood_id: nId,
            }));

            await supabaseAdmin
              .from('user_neighborhood_preferences')
              .upsert(prefsToInsert, { onConflict: 'user_id,neighborhood_id' });
          }
        } catch (e) {
          console.error('Failed to save neighborhood preferences:', e);
        }
      }

      // Successful login - redirect to home or specified next page
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  // If there's an error or no code, redirect to home with error
  return NextResponse.redirect(new URL('/?auth_error=true', requestUrl.origin));
}
