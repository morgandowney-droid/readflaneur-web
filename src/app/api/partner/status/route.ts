import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get('email');
    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: partner } = await supabaseAdmin
      .from('agent_partners')
      .select('*')
      .eq('agent_email', email.toLowerCase().trim())
      .in('status', ['setup', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!partner) {
      return NextResponse.json({ partner: null });
    }

    return NextResponse.json({ partner });
  } catch {
    return NextResponse.json({ partner: null });
  }
}
