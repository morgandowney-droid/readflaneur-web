import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

/**
 * Free "Founding Partner" activation.
 *
 * Flips an agent partner from 'setup' to 'active' with `plan='free'`, then
 * sends the admin notification + the broker welcome email. Emails are
 * best-effort - a send failure does not roll back the activation.
 *
 * The paid activation path (Stripe subscription) lives inline in the Stripe
 * webhook's `checkout.session.completed` handler and sets `plan='paid'`.
 */
export async function activatePartner(
  supabase: SupabaseClient,
  partnerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error: updateError } = await supabase
    .from('agent_partners')
    .update({
      status: 'active',
      activated_at: new Date().toISOString(),
      plan: 'free',
    })
    .eq('id', partnerId);

  if (updateError) {
    console.error(`activatePartner: failed to activate ${partnerId}:`, updateError);
    return { ok: false, error: updateError.message };
  }

  console.log(`Partner ${partnerId} activated (free Founding Partner)`);

  // Emails are best-effort - activation already succeeded above.
  try {
    const { data: partner } = await supabase
      .from('agent_partners')
      .select('agent_name, agent_email, agent_slug, neighborhood_id')
      .eq('id', partnerId)
      .single();

    if (!partner) return { ok: true };

    const { data: neighborhood } = await supabase
      .from('neighborhoods')
      .select('name, city')
      .eq('id', partner.neighborhood_id)
      .single();

    const neighborhoodLabel = neighborhood
      ? `${neighborhood.name}, ${neighborhood.city}`
      : partner.neighborhood_id;

    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      await sendEmail({
        to: adminEmail,
        subject: `New Agent Partner: ${partner.agent_name} - ${partner.neighborhood_id}`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 600px;">
            <h2>New Agent Partner Activated</h2>
            <p><strong>Agent:</strong> ${partner.agent_name}</p>
            <p><strong>Email:</strong> ${partner.agent_email}</p>
            <p><strong>Neighborhood:</strong> ${partner.neighborhood_id}</p>
            <p><strong>Plan:</strong> Founding Partner (free during beta)</p>
          </div>
        `,
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/[\n\r]+$/, '').replace(/\/$/, '')
      || 'https://readflaneur.com';
    const subscribeUrl = `${appUrl}/r/${partner.agent_slug}`;
    const dashboardUrl = `${appUrl}/partner/dashboard`;

    await sendEmail({
      to: partner.agent_email,
      subject: `Welcome to Flaneur - your ${neighborhoodLabel} newsletter starts tomorrow`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; color: #1c1917; line-height: 1.6;">
          <p style="font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: #78716c; margin: 0 0 24px;">Welcome to Flaneur</p>

          <h1 style="font-size: 28px; font-weight: 300; margin: 0 0 16px;">Your ${neighborhoodLabel} newsletter is live</h1>

          <p>${partner.agent_name},</p>

          <p>You're now the exclusive Flaneur partner for <strong>${neighborhoodLabel}</strong>. Here's what happens next:</p>

          <div style="margin: 32px 0; padding: 24px; background: #fafaf9; border-left: 3px solid #b45309;">
            <p style="margin: 0 0 8px; font-weight: 600;">Your first branded Daily Brief goes out tomorrow at 7 AM local time.</p>
            <p style="margin: 0; color: #57534e; font-size: 15px;">Every client you've added (and any you add later) will receive it. You'll receive a copy too, so you see exactly what they see.</p>
          </div>

          <h3 style="font-size: 18px; margin: 32px 0 12px;">What you'll get</h3>
          <ul style="padding-left: 20px; color: #44403c;">
            <li style="margin-bottom: 8px;"><strong>A daily copy of your own newsletter</strong>, delivered to ${partner.agent_email} every morning. This is the same email your clients receive.</li>
            <li style="margin-bottom: 8px;"><strong>Weekly performance report</strong>, delivered every Monday: subscribers added, opens, clicks, and listing impressions from the week.</li>
            <li style="margin-bottom: 8px;"><strong>Founding Partner status.</strong> Flaneur is in beta, so your partnership is free. When partner pricing launches, your founding-partner rate is locked in.</li>
            <li style="margin-bottom: 8px;"><strong>No deletion ever.</strong> Your neighborhood, your listings, and your client list are yours and stay intact.</li>
          </ul>

          <h3 style="font-size: 18px; margin: 32px 0 12px;">Share your newsletter</h3>
          <p>Send this link to past clients, prospects, and sphere-of-influence to add them to your list:</p>
          <p style="word-break: break-all; font-family: monospace; background: #fafaf9; padding: 12px; border-radius: 4px; font-size: 14px;"><a href="${subscribeUrl}" style="color: #b45309;">${subscribeUrl}</a></p>

          <h3 style="font-size: 18px; margin: 32px 0 12px;">Manage your account</h3>
          <p>Add clients, update your listings, change your photo, or pause sends from your dashboard:</p>
          <p><a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background: #1c1917; color: #fafaf9; text-decoration: none; border-radius: 4px; font-size: 14px; letter-spacing: 0.05em; text-transform: uppercase;">Open Dashboard</a></p>

          <p style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #e7e5e4; color: #78716c; font-size: 14px;">Questions? Just reply to this email - it reaches Morgan Downey, who built Flaneur.</p>
        </div>
      `,
    });
  } catch (emailErr) {
    console.error(`activatePartner: email step failed for ${partnerId}:`, emailErr);
  }

  return { ok: true };
}
