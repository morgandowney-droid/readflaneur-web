import { NextRequest, NextResponse } from 'next/server';

// Check newsletter subscription status by email.
// Uses direct REST API with service role key so it works regardless of session state.
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ subscribed: false });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const res = await fetch(
      `${supabaseUrl}/rest/v1/newsletter_subscribers?select=id&email=eq.${encodeURIComponent(email.toLowerCase().trim())}&limit=1`,
      {
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        subscribed: Array.isArray(data) && data.length > 0,
      });
    }

    return NextResponse.json({ subscribed: false });
  } catch {
    return NextResponse.json({ subscribed: false });
  }
}
