import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const { email, neighborhoodIds = [], timezone } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Admin client for bypassing RLS and CAPTCHA
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
      const updateData: { neighborhood_ids: string[]; timezone?: string } = {
        neighborhood_ids: neighborhoodIds
      };
      if (timezone) {
        updateData.timezone = timezone;
      }
      await supabaseAdmin
        .from('newsletter_subscribers')
        .update(updateData)
        .eq('id', existingSubscriber.id);

      return NextResponse.json({
        success: true,
        message: 'Preferences updated!'
      });
    }

    // Build callback URL with newsletter flag and neighborhood IDs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\n$/, '').replace(/\/$/, '')
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const callbackUrl = `${baseUrl}/auth/callback?newsletter=true&neighborhoods=${encodeURIComponent(JSON.stringify(neighborhoodIds))}`;

    // Use admin generateLink to bypass CAPTCHA requirement
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
      options: {
        redirectTo: callbackUrl,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Generate link error:', linkError);
      return NextResponse.json({
        success: false,
        error: 'Failed to send verification email. Please try again.'
      }, { status: 500 });
    }

    // Send the magic link via Resend
    const actionLink = linkData.properties.action_link;
    const emailSent = await sendEmail({
      to: normalizedEmail,
      subject: 'Welcome to Flaneur',
      html: buildMagicLinkEmail(actionLink),
    });

    if (!emailSent) {
      console.error('Resend email send failed for:', normalizedEmail);
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

function buildMagicLinkEmail(actionLink: string): string {
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
              Click below to verify your email and start receiving daily neighborhood stories.
            </td>
          </tr>
          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding-bottom:48px;">
              <a href="${actionLink}" style="display:inline-block; background-color:#ffffff; color:#171717; padding:14px 32px; font-size:14px; font-weight:600; text-decoration:none; border-radius:6px; letter-spacing:0.05em;">
                Verify Email
              </a>
            </td>
          </tr>
          <!-- What to Expect -->
          <tr>
            <td style="padding-bottom:12px;">
              <div style="width:32px; height:1px; background-color:#525252; margin:0 auto;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:20px; color:#a3a3a3; font-size:15px; line-height:1.6; text-align:center; font-family:'Playfair Display',Georgia,serif;">
              Here&rsquo;s what to expect
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" style="padding:12px 8px 12px 0; vertical-align:top;">
                    <div style="font-size:13px; font-weight:600; color:#C9A96E; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:4px;">Daily Brief</div>
                    <div style="font-size:13px; color:#737373; line-height:1.5;">Your neighborhoods&rsquo; morning news, emailed daily at 7 AM.</div>
                  </td>
                  <td width="50%" style="padding:12px 0 12px 8px; vertical-align:top;">
                    <div style="font-size:13px; font-weight:600; color:#C9A96E; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:4px;">Look Ahead</div>
                    <div style="font-size:13px; color:#737373; line-height:1.5;">What&rsquo;s happening today and in the next 7 days, delivered each morning.</div>
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="padding:12px 8px 12px 0; vertical-align:top;">
                    <div style="font-size:13px; font-weight:600; color:#C9A96E; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:4px;">Sunday Edition</div>
                    <div style="font-size:13px; color:#737373; line-height:1.5;">Your week in review and the week ahead, every Sunday at 7 AM.</div>
                  </td>
                  <td width="50%" style="padding:12px 0 12px 8px; vertical-align:top;">
                    <div style="font-size:13px; font-weight:600; color:#C9A96E; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:4px;">Family Corner</div>
                    <div style="font-size:13px; color:#737373; line-height:1.5;">Opt-in childcare events and activities tailored to your kids&rsquo; ages.</div>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;">
                <tr>
                  <td style="padding:12px 0; text-align:center;">
                    <div style="font-size:13px; font-weight:600; color:#C9A96E; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:4px;">Escape Mode</div>
                    <div style="font-size:13px; color:#737373; line-height:1.5;">Take a mini vacation to luxury neighborhoods around the world. Live like a local for 5 minutes.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Deliverability Coaching -->
          <tr>
            <td style="padding-bottom:12px;">
              <div style="width:32px; height:1px; background-color:#525252; margin:0 auto;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:8px; color:#a3a3a3; font-size:15px; line-height:1.6; text-align:center; font-family:'Playfair Display',Georgia,serif;">
              Make sure Flaneur lands in your inbox
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 0; color:#737373; font-size:13px; line-height:1.6;">
                    <strong style="color:#a3a3a3;">Gmail:</strong> Move this email to your Primary tab. On mobile, tap the three dots and select &ldquo;Move to&rdquo; &rarr; &ldquo;Primary.&rdquo;
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0; color:#737373; font-size:13px; line-height:1.6;">
                    <strong style="color:#a3a3a3;">Apple Mail:</strong> Tap on our email address at the top and select &ldquo;Add to VIPs.&rdquo;
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0; color:#737373; font-size:13px; line-height:1.6;">
                    <strong style="color:#a3a3a3;">Everyone else:</strong> Add hello@readflaneur.com to your contacts.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="color:#525252; font-size:12px; line-height:1.6;">
              If you did not request this email, you can safely ignore it.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
