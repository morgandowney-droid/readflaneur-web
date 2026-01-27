import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, neighborhoodIds = [] } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
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

    // Admin client for user creation and bypassing RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if already subscribed to newsletter
    const { data: existingSubscriber } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    // Subscribe to newsletter or update preferences
    if (!existingSubscriber) {
      const { error: subscribeError } = await supabaseAdmin
        .from('newsletter_subscribers')
        .insert({
          email: normalizedEmail,
          subscribed_at: new Date().toISOString(),
          neighborhood_ids: neighborhoodIds,
        });

      if (subscribeError) {
        console.error('Newsletter subscribe error:', subscribeError);
        return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
      }
    } else {
      // Update neighborhood preferences for existing subscriber
      await supabaseAdmin
        .from('newsletter_subscribers')
        .update({ neighborhood_ids: neighborhoodIds })
        .eq('id', existingSubscriber.id);
    }

    // Check if user account already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === normalizedEmail);

    if (!existingUser) {
      // Send magic link to create account and log in
      // This uses signInWithOtp which creates user if they don't exist
      // Store neighborhood preferences in user metadata so we can save them after account creation
      const { error: magicLinkError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?neighborhoods=${encodeURIComponent(JSON.stringify(neighborhoodIds))}`,
        },
      });

      if (magicLinkError) {
        console.error('Magic link error:', magicLinkError);
        // Don't fail the whole request - newsletter subscription succeeded
        return NextResponse.json({
          success: true,
          accountCreated: false,
          message: 'Subscribed! Account creation failed - try logging in later.'
        });
      }

      return NextResponse.json({
        success: true,
        accountCreated: true,
        message: 'Check your email for a magic link to complete signup!'
      });
    }

    // User already has account - save their neighborhood preferences
    if (neighborhoodIds.length > 0) {
      // Clear existing preferences and add new ones
      await supabaseAdmin
        .from('user_neighborhood_preferences')
        .delete()
        .eq('user_id', existingUser.id);

      const prefsToInsert = neighborhoodIds.map((nId: string) => ({
        user_id: existingUser.id,
        neighborhood_id: nId,
      }));

      await supabaseAdmin
        .from('user_neighborhood_preferences')
        .insert(prefsToInsert);
    }

    return NextResponse.json({
      success: true,
      accountCreated: false,
      message: existingSubscriber ? 'Preferences updated!' : 'Subscribed!'
    });
  } catch (err) {
    console.error('Newsletter API error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
