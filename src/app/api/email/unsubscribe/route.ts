import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Email unsubscribe endpoint (CAN-SPAM compliance)
 *
 * GET /api/email/unsubscribe?token=xxx          — Show confirmation page with save options
 * GET /api/email/unsubscribe?token=xxx&confirm=1 — Actually unsubscribe
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const confirm = url.searchParams.get('confirm');

  if (!token) {
    return new NextResponse(renderPage('Missing Token', 'error', 'No unsubscribe token provided.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find the subscriber/profile
  const { data: subscriber } = await supabase
    .from('newsletter_subscribers')
    .select('id, email, unsubscribe_token')
    .eq('unsubscribe_token', token)
    .single();

  const { data: profile } = !subscriber ? await supabase
    .from('profiles')
    .select('id, email, email_unsubscribe_token')
    .eq('email_unsubscribe_token', token)
    .single() : { data: null };

  const record = subscriber || profile;
  const source = subscriber ? 'newsletter' : 'profile';

  if (!record) {
    return new NextResponse(
      renderPage('Token Not Found', 'error', 'This unsubscribe link may have expired or already been used.'),
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    );
  }

  // If confirm=1, actually unsubscribe
  if (confirm === '1') {
    if (source === 'newsletter') {
      await supabase
        .from('newsletter_subscribers')
        .update({ daily_email_enabled: false })
        .eq('unsubscribe_token', token);
    } else {
      await supabase
        .from('profiles')
        .update({ daily_email_enabled: false })
        .eq('email_unsubscribe_token', token);
    }

    return new NextResponse(
      renderPage('Unsubscribed', 'success', `You've been unsubscribed from the Daily Brief. You will no longer receive daily emails at ${record.email}.`),
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Show save page with alternatives
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';
  const preferencesUrl = `${appUrl}/email/preferences?token=${token}`;
  const confirmUrl = `${appUrl}/api/email/unsubscribe?token=${token}&confirm=1`;

  return new NextResponse(
    renderSavePage(record.email, preferencesUrl, confirmUrl),
    { headers: { 'Content-Type': 'text/html' } }
  );
}

function renderSavePage(email: string, preferencesUrl: string, confirmUrl: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Unsubscribe - Flaneur</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 480px;
      margin: 60px auto;
      padding: 0 20px;
      color: #333;
    }
    .masthead {
      font-weight: 300;
      letter-spacing: 0.15em;
      font-size: 24px;
      margin-bottom: 32px;
      text-align: center;
    }
    .masthead a { color: #000; text-decoration: none; }
    h2 {
      font-weight: 500;
      font-size: 22px;
      margin-bottom: 8px;
      text-align: center;
    }
    .subtitle {
      font-size: 14px;
      color: #666;
      text-align: center;
      margin-bottom: 32px;
    }
    .option {
      border: 1px solid #e5e5e5;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 12px;
      cursor: pointer;
      text-decoration: none;
      display: block;
      color: inherit;
      transition: border-color 0.2s;
    }
    .option:hover { border-color: #000; }
    .option-title {
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 4px;
    }
    .option-desc {
      font-size: 13px;
      color: #666;
      line-height: 1.4;
    }
    .option.primary {
      background: #000;
      color: #fff;
      border-color: #000;
      border-radius: 12px;
    }
    .option.primary .option-desc { color: #ccc; }
    .option.primary:hover { background: #222; }
    .divider {
      text-align: center;
      color: #999;
      font-size: 12px;
      margin: 20px 0;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .unsubscribe-link {
      display: block;
      text-align: center;
      color: #999;
      font-size: 13px;
      margin-top: 24px;
    }
    .unsubscribe-link a {
      color: #999;
    }
  </style>
</head>
<body>
  <div class="masthead"><a href="${appUrl}">FLANEUR</a></div>
  <h2>Before you go...</h2>
  <p class="subtitle">We'd hate to see you leave. Here are some alternatives:</p>

  <a href="${preferencesUrl}" class="option primary">
    <div class="option-title">Change your neighborhoods</div>
    <div class="option-desc">Add or remove neighborhoods, or switch your primary location. Get only the stories you care about.</div>
  </a>

  <a href="${preferencesUrl}&action=frequency" class="option">
    <div class="option-title">Switch to weekly recap</div>
    <div class="option-desc">Too many emails? Get a single weekly recap every Sunday morning, instead of the daily Brief.</div>
  </a>

  <a href="${preferencesUrl}&action=pause" class="option">
    <div class="option-title">Pause emails</div>
    <div class="option-desc">Take a break. You can resume anytime from your preferences.</div>
  </a>

  <div class="divider">or</div>

  <p class="unsubscribe-link">
    <a href="${confirmUrl}">Unsubscribe from all emails</a>
  </p>
</body>
</html>`;
}

function renderPage(title: string, type: 'success' | 'error', message: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - Flaneur</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 480px;
      margin: 60px auto;
      padding: 0 20px;
      color: #333;
    }
    .masthead {
      font-weight: 300;
      letter-spacing: 0.15em;
      font-size: 24px;
      margin-bottom: 32px;
      text-align: center;
    }
    .masthead a { color: #000; text-decoration: none; }
    h2 {
      font-weight: 500;
      font-size: 20px;
      margin-bottom: 16px;
      text-align: center;
    }
    p {
      font-size: 15px;
      line-height: 1.6;
      color: #555;
      text-align: center;
    }
    .cta {
      display: block;
      text-align: center;
      margin-top: 24px;
      color: #000;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="masthead"><a href="${appUrl}">FLANEUR</a></div>
  <h2>${title}</h2>
  <p>${message}</p>
  <a class="cta" href="${appUrl}">Return to Flaneur</a>
</body>
</html>`;
}
