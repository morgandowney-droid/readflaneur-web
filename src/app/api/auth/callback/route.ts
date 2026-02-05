import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const redirect = requestUrl.searchParams.get('redirect') || '/';
  const isNewsletter = requestUrl.searchParams.get('newsletter') === 'true';
  const neighborhoodsParam = requestUrl.searchParams.get('neighborhoods');

  if (code) {
    const supabase = await createClient();
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('OAuth callback error:', error);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
      );
    }

    // If this is a newsletter verification callback, complete the subscription
    if (isNewsletter && sessionData?.user?.email) {
      try {
        const supabaseAdmin = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const email = sessionData.user.email.toLowerCase().trim();
        const neighborhoodIds = neighborhoodsParam ? JSON.parse(decodeURIComponent(neighborhoodsParam)) : [];

        // Check if already subscribed
        const { data: existingSubscriber } = await supabaseAdmin
          .from('newsletter_subscribers')
          .select('id')
          .eq('email', email)
          .single();

        if (!existingSubscriber) {
          // Create verified subscription
          await supabaseAdmin
            .from('newsletter_subscribers')
            .insert({
              email,
              subscribed_at: new Date().toISOString(),
              neighborhood_ids: neighborhoodIds,
              email_verified: true,
              verified_at: new Date().toISOString(),
            });
        } else {
          // Update existing to verified
          await supabaseAdmin
            .from('newsletter_subscribers')
            .update({
              email_verified: true,
              verified_at: new Date().toISOString(),
              neighborhood_ids: neighborhoodIds,
            })
            .eq('id', existingSubscriber.id);
        }

        // Also save user neighborhood preferences
        if (neighborhoodIds.length > 0 && sessionData.user.id) {
          await supabaseAdmin
            .from('user_neighborhood_preferences')
            .delete()
            .eq('user_id', sessionData.user.id);

          const prefsToInsert = neighborhoodIds.map((nId: string) => ({
            user_id: sessionData.user.id,
            neighborhood_id: nId,
          }));

          await supabaseAdmin
            .from('user_neighborhood_preferences')
            .insert(prefsToInsert);
        }

        // Redirect to feed with success message
        const feedUrl = neighborhoodIds.length > 0
          ? `/feed?neighborhoods=${neighborhoodIds.join(',')}&subscribed=true`
          : '/?subscribed=true';
        return NextResponse.redirect(new URL(feedUrl, requestUrl.origin));
      } catch (err) {
        console.error('Newsletter subscription completion error:', err);
        // Still redirect, but without success flag
      }
    }
  }

  // Redirect to the original destination or home
  return NextResponse.redirect(new URL(redirect, requestUrl.origin));
}
