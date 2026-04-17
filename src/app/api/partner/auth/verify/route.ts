import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    if (!token || !email) {
      return NextResponse.json({ error: 'Missing token or email' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find partner with matching token and email
    const { data: partner } = await supabaseAdmin
      .from('agent_partners')
      .select('id, auth_token, auth_token_expires')
      .eq('agent_email', cleanEmail)
      .eq('auth_token', token)
      .limit(1)
      .single();

    if (!partner) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 });
    }

    // Check expiry
    if (partner.auth_token_expires && new Date(partner.auth_token_expires) < new Date()) {
      return NextResponse.json({ error: 'Link has expired. Please request a new one.' }, { status: 401 });
    }

    // Clear token (one-time use)
    await supabaseAdmin
      .from('agent_partners')
      .update({ auth_token: null, auth_token_expires: null })
      .eq('id', partner.id);

    // Set session cookie
    const response = NextResponse.json({ partnerId: partner.id });
    response.cookies.set('flaneur-partner-session', partner.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('[partner-auth-verify] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
