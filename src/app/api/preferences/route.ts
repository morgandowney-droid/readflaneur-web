import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * @swagger
 * /api/preferences:
 *   post:
 *     summary: Update user preferences
 *     description: Persists theme, language, and timezone preferences to the profiles table. Silent no-op for anonymous users. Timezone auto-detect only sets if null unless forceTimezone is true.
 *     tags:
 *       - Preferences
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               theme:
 *                 type: string
 *                 enum: [dark, light]
 *               language:
 *                 type: string
 *                 description: ISO 639-1 language code (e.g. sv, fr, de). 'en' clears the preference.
 *               timezone:
 *                 type: string
 *                 description: IANA timezone (must contain '/')
 *               forceTimezone:
 *                 type: boolean
 *                 description: If true, always overwrite timezone. If false, only set when null.
 *     responses:
 *       200:
 *         description: Preferences updated (or silent no-op for anonymous users)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 */
export async function POST(request: NextRequest) {
  try {
    const { theme, language, timezone, forceTimezone } = await request.json();

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

    // Timezone: forceTimezone=true for explicit user action, otherwise only set if null
    if (typeof timezone === 'string' && timezone.includes('/')) {
      if (forceTimezone) {
        updates.primary_timezone = timezone;
      } else {
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const checkRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=primary_timezone`,
          {
            headers: {
              'apikey': serviceRoleKey,
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
          }
        );
        const rows = await checkRes.json();
        if (!rows?.[0]?.primary_timezone) {
          updates.primary_timezone = timezone;
        }
      }
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
