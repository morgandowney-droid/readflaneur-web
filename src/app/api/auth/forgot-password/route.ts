import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

/**
 * POST /api/auth/forgot-password
 *
 * Generates a password reset link via Supabase admin API
 * and sends it through Resend for better deliverability.
 * Same pattern as /api/newsletter/subscribe.
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Derive base URL from request headers (most reliable - always matches the domain the user is on)
    const host = request.headers.get('host') || 'readflaneur.com';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    const redirectTo = `${baseUrl}/reset-password`;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail,
      options: {
        redirectTo,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Generate recovery link error:', linkError);
      // Don't reveal if email exists or not
      return NextResponse.json({ success: true });
    }

    // Supabase may override redirectTo with its Site URL if our redirect isn't in the
    // Dashboard allowlist. Fix the redirect_to in the action link to ensure it points
    // to our production domain.
    const actionLink = linkData.properties.action_link.replace(
      /redirect_to=[^&]*/,
      `redirect_to=${encodeURIComponent(redirectTo)}`
    );
    await sendEmail({
      to: normalizedEmail,
      subject: 'Reset your Flaneur password',
      html: buildPasswordResetEmail(actionLink),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Forgot password API error:', err);
    // Don't reveal errors to client
    return NextResponse.json({ success: true });
  }
}

function buildPasswordResetEmail(actionLink: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&display=swap');
  </style>
</head>
<body style="margin:0; padding:0; background-color:#050505; font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#050505; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="500" cellpadding="0" cellspacing="0" style="max-width:500px;">
          <!-- Masthead -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <span style="font-family:'Playfair Display',Georgia,serif; font-size:28px; letter-spacing:0.3em; color:#e5e5e5;">
                FLANEUR
              </span>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="width:32px; height:1px; background-color:#525252;"></div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding-bottom:32px; color:#a3a3a3; font-size:16px; line-height:1.7; text-align:center;">
              Click below to reset your password. This link expires in 24 hours.
            </td>
          </tr>
          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding-bottom:40px;">
              <a href="${actionLink}" style="display:inline-block; background-color:#ffffff; color:#171717; padding:14px 32px; font-size:14px; font-weight:600; text-decoration:none; border-radius:6px; letter-spacing:0.05em;">
                Reset Password
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="color:#525252; font-size:12px; line-height:1.6;">
              If you did not request this, you can safely ignore this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
