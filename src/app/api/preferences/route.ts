import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { theme, language } = await request.json();

    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ ok: true }); // Silent no-op for anonymous users
    }

    const updates: Record<string, string | null> = {};
    if (theme === 'light' || theme === 'dark') {
      updates.preferred_theme = theme;
    }
    if (typeof language === 'string') {
      updates.preferred_language = language === 'en' ? null : language;
    }

    if (Object.keys(updates).length > 0) {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(updates),
        }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Non-critical, never fail
  }
}
