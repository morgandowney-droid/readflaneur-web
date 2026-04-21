import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Broker drip unsubscribe endpoint.
 *
 * Called from the link at the bottom of every cold-pitch drip email:
 *   https://readflaneur.com/api/broker-drip/unsub?token={unsub_token}
 *
 * Flips drip_status to 'unsubscribed' so the cron stops sending. Returns a
 * friendly HTML page. No auth, no login - the token is the proof of identity.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token || !/^[a-f0-9]{32}$/.test(token)) {
    return htmlResponse(
      'Invalid unsubscribe link',
      'That link is malformed. If you were trying to unsubscribe from our broker outreach, please reply to the email with "no thanks" and I will remove you manually.',
      400
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find the broker_outreach row(s) for this token. Same broker may have
  // multiple rows (different neighborhoods). Unsub all of them at once.
  const { data: rows, error: fetchErr } = await supabase
    .from('broker_outreach')
    .select('id, broker_email, broker_name, drip_status')
    .eq('unsub_token', token);

  if (fetchErr || !rows || rows.length === 0) {
    return htmlResponse(
      'Already removed',
      'This email address is not in our outreach list. You may have already unsubscribed, or the link has expired. Either way, you will not receive any further broker outreach from Flaneur.',
      200
    );
  }

  const brokerEmail = rows[0].broker_email;
  const brokerName = rows[0].broker_name || 'there';

  // Unsub ALL rows for this broker email (any neighborhood). One click removes
  // them from the whole campaign.
  const { error: updateErr } = await supabase
    .from('broker_outreach')
    .update({ drip_status: 'unsubscribed' })
    .eq('broker_email', brokerEmail)
    .in('drip_status', ['pending', 'active', 'subscribed', 'warm']);

  if (updateErr) {
    console.error('broker unsub update failed:', updateErr);
    return htmlResponse(
      'Error',
      'Something went wrong. Please reply to the email with "no thanks" and I will remove you manually.',
      500
    );
  }

  const firstName = brokerName.split(' ')[0];
  return htmlResponse(
    'Unsubscribed',
    `You have been removed, ${firstName}. You will not receive any further broker outreach from Flaneur. Thank you for letting me know.`,
    200
  );
}

function htmlResponse(title: string, body: string, status: number) {
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - Flaneur</title>
<style>
  body { font-family: Georgia, serif; background: #fdfcfa; color: #1c1917; max-width: 520px; margin: 120px auto; padding: 0 24px; line-height: 1.6; }
  .wordmark { font-size: 22px; letter-spacing: 0.32em; font-weight: 400; margin-bottom: 48px; color: #1c1917; }
  h1 { font-size: 28px; font-weight: 400; margin-bottom: 16px; }
  p { font-size: 16px; color: #44403c; margin-bottom: 16px; }
  .footer { margin-top: 48px; font-size: 13px; color: #78716c; border-top: 1px solid #d9d2c6; padding-top: 16px; }
  a { color: #92400e; text-decoration: none; }
</style>
</head>
<body>
  <div class="wordmark">FL&Acirc;NEUR</div>
  <h1>${title}</h1>
  <p>${body}</p>
  <div class="footer">
    Morgan Downey &middot; Founder &middot; <a href="mailto:md@readflaneur.com">md@readflaneur.com</a>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
