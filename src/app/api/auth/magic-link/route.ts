import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * @swagger
 * /api/auth/magic-link:
 *   post:
 *     tags: [Auth]
 *     summary: Send passwordless sign-in link
 *     description: Generates a magic link for the given email and sends it via Resend. Creates an account if one doesn't exist. No password required.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               redirect:
 *                 type: string
 *                 description: URL to redirect to after sign-in
 *     responses:
 *       200:
 *         description: Magic link sent
 *       400:
 *         description: Invalid email
 */
export async function POST(request: NextRequest) {
  try {
    const { email, redirect = '/feed' } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\n$/, '').replace(/\/$/, '')
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    // Generate magic link via Supabase admin (bypasses CAPTCHA)
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: cleanEmail,
      options: {
        redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(redirect)}`,
      },
    });

    if (error) {
      console.error('[magic-link] generateLink error:', error);
      // Don't expose internal errors - always show success to prevent email enumeration
      return NextResponse.json({ success: true });
    }

    const actionLink = data?.properties?.action_link;
    if (!actionLink) {
      console.error('[magic-link] No action_link in response');
      return NextResponse.json({ success: true });
    }

    // Send branded email via Resend
    await sendEmail({
      to: cleanEmail,
      subject: 'Sign in to Flaneur',
      html: buildMagicLinkEmail(actionLink, appUrl),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[magic-link] Error:', err);
    // Always return success to prevent email enumeration
    return NextResponse.json({ success: true });
  }
}

function buildMagicLinkEmail(link: string, appUrl: string): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h1 style="font-family: 'Cormorant Garamond', Georgia, serif; font-size: 28px; font-weight: 300; letter-spacing: 0.3em; text-align: center; color: #1a1a1a; margin-bottom: 30px;">
        FLANEUR
      </h1>
      <p style="font-size: 16px; color: #333; line-height: 1.6; text-align: center; margin-bottom: 30px;">
        Click the button below to sign in to your account.
      </p>
      <div style="text-align: center; margin-bottom: 30px;">
        <a href="${link}" style="display: inline-block; background: #1a1a1a; color: #ffffff; padding: 14px 40px; text-decoration: none; font-size: 14px; letter-spacing: 0.1em; text-transform: uppercase; border-radius: 8px;">
          Sign In
        </a>
      </div>
      <p style="font-size: 12px; color: #999; text-align: center; line-height: 1.5;">
        This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="font-size: 11px; color: #bbb; text-align: center;">
        <a href="${appUrl}" style="color: #bbb; text-decoration: none;">readflaneur.com</a>
      </p>
    </div>
  `;
}
