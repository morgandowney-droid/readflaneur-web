import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

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

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user already has an approved journalist role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role === 'journalist' || profile?.role === 'admin') {
      return NextResponse.json({ alreadyApproved: true });
    }

    // Check if user already applied
    const { data: existingApplication } = await supabase
      .from('journalist_applications')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (existingApplication) {
      return NextResponse.json({ alreadyApplied: true });
    }

    // Fetch neighborhoods for selection
    const { data: neighborhoods } = await supabase
      .from('neighborhoods')
      .select('id, name, city')
      .order('city')
      .order('name');

    return NextResponse.json({ neighborhoods: neighborhoods || [] });
  } catch (err) {
    console.error('Journalist apply API error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { neighborhoodId, zipCode, phone, bio, whyInterested, photoUrl1, photoUrl2 } = body;

    // Validation
    if (!neighborhoodId || !zipCode || !phone || !bio || !photoUrl1 || !photoUrl2) {
      return NextResponse.json({ error: 'All required fields must be filled' }, { status: 400 });
    }

    // Check for existing application
    const { data: existingApplication } = await supabase
      .from('journalist_applications')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (existingApplication) {
      return NextResponse.json({ error: 'You have already submitted an application' }, { status: 400 });
    }

    // Create application
    const { error: insertError } = await supabase
      .from('journalist_applications')
      .insert({
        user_id: user.id,
        neighborhood_id: neighborhoodId,
        zip_code: zipCode,
        phone: phone,
        bio: bio,
        why_interested: whyInterested || null,
        photo_url_1: photoUrl1,
        photo_url_2: photoUrl2,
        status: 'pending',
      });

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Journalist apply POST error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
