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

    // Admin client for bypassing RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if already subscribed (and verified) to newsletter
    const { data: existingSubscriber } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('id, email_verified')
      .eq('email', normalizedEmail)
      .single();

    // If already verified, just update preferences
    if (existingSubscriber?.email_verified) {
      await supabaseAdmin
        .from('newsletter_subscribers')
        .update({ neighborhood_ids: neighborhoodIds })
        .eq('id', existingSubscriber.id);

      return NextResponse.json({
        success: true,
        message: 'Preferences updated!'
      });
    }

    // Build callback URL with newsletter flag and neighborhood IDs
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?newsletter=true&neighborhoods=${encodeURIComponent(JSON.stringify(neighborhoodIds))}`;

    // Send magic link for email verification
    // This both verifies email AND creates/logs in user account
    const { error: magicLinkError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: callbackUrl,
      },
    });

    if (magicLinkError) {
      console.error('Magic link error:', magicLinkError);
      return NextResponse.json({
        success: false,
        error: 'Failed to send verification email. Please try again.'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Check your email for a verification link!'
    });
  } catch (err) {
    console.error('Newsletter API error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
