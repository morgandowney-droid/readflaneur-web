import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find agent partner by email
    const { data: partner } = await supabaseAdmin
      .from('agent_partners')
      .select('id, agent_name, status')
      .eq('agent_email', cleanEmail)
      .in('status', ['setup', 'active', 'paused'])
      .limit(1)
      .single();

    if (!partner) {
      // Always return success to prevent email enumeration
      return NextResponse.json({ success: true });
    }

    // Generate random token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store token in DB
    const { error: updateError } = await supabaseAdmin
      .from('agent_partners')
      .update({
        auth_token: token,
        auth_token_expires: expires.toISOString(),
      })
      .eq('id', partner.id);

    if (updateError) {
      console.error('[partner-auth] Token store error:', updateError);
      return NextResponse.json({ success: true });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\n$/, '').replace(/\/$/, '')
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const dashboardLink = `${appUrl}/partner/dashboard?token=${token}&email=${encodeURIComponent(cleanEmail)}`;

    await sendEmail({
      to: cleanEmail,
      subject: 'Sign in to your Flaneur Partner Dashboard',
      html: buildPartnerMagicLinkEmail(partner.agent_name, dashboardLink, appUrl),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[partner-auth] Error:', err);
    return NextResponse.json({ success: true });
  }
}

function buildPartnerMagicLinkEmail(name: string, link: string, appUrl: string): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h1 style="font-family: 'Cormorant Garamond', Georgia, serif; font-size: 28px; font-weight: 300; letter-spacing: 0.3em; text-align: center; color: #1a1a1a; margin-bottom: 30px;">
        FLANEUR
      </h1>
      <p style="font-size: 16px; color: #333; line-height: 1.6; text-align: center; margin-bottom: 8px;">
        Hi ${name},
      </p>
      <p style="font-size: 16px; color: #333; line-height: 1.6; text-align: center; margin-bottom: 30px;">
        Click the button below to access your partner dashboard.
      </p>
      <div style="text-align: center; margin-bottom: 30px;">
        <a href="${link}" style="display: inline-block; background: #1a1a1a; color: #ffffff; padding: 14px 40px; text-decoration: none; font-size: 14px; letter-spacing: 0.1em; text-transform: uppercase; border-radius: 8px;">
          Open Dashboard
        </a>
      </div>
      <p style="font-size: 12px; color: #999; text-align: center; line-height: 1.5;">
        This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="font-size: 11px; color: #bbb; text-align: center;">
        <a href="${appUrl}" style="color: #bbb; text-decoration: none;">readflaneur.com</a>
      </p>
    </div>
  `;
}
