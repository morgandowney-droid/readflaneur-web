// One-off: send a two-email broker cold pitch to morgan.downey@gmail.com
// as if Morgan were a prospective Eklund Östermalm broker.
// Email 1: cold pitch from founder. Email 2: live branded Daily Brief preview.

import { config } from 'dotenv';
import { Resend } from 'resend';
config({ path: '.env.local' });

const TO = 'morgan.downey@gmail.com';
const NEIGHBORHOOD_ID = 'stockholm-ostermalm';
const NEIGHBORHOOD_DISPLAY = 'Östermalm';
const BROKER_NAME = 'Morgan Downey';
const BROKERAGE = 'Eklund';
const APP_URL = 'https://readflaneur.com';

const SETUP_URL = `${APP_URL}/partner/setup`
  + `?neighborhood=${encodeURIComponent(NEIGHBORHOOD_ID)}`
  + `&name=${encodeURIComponent(BROKER_NAME)}`
  + `&email=${encodeURIComponent(TO)}`
  + `&brokerage=${encodeURIComponent(BROKERAGE)}`;

const resend = new Resend(process.env.RESEND_API_KEY);

const coldPitchHtml = `
<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; color: #1c1917; line-height: 1.7; font-size: 16px;">
  <p>Hi Morgan,</p>

  <p>I noticed Eklund is one of the top brokerages covering Östermalm, so I wanted to reach out directly.</p>

  <p>I built Flaneur - a morning newsletter about Östermalm. Restaurant openings, cultural events, market moves, the things your clients already read Dagens Nyheter or Svenska Dagbladet for, but pulled into a single three-minute read they open with their coffee.</p>

  <p>Here's what the broker version looks like:</p>

  <ul style="padding-left: 20px; color: #44403c;">
    <li style="margin-bottom: 10px;"><strong>Your name and photo at the top.</strong> Your listings inline. Not a banner ad - it reads like a newsletter you curate.</li>
    <li style="margin-bottom: 10px;"><strong>Exclusive to one agent per neighborhood.</strong> Whoever signs first for Östermalm keeps it for as long as they subscribe.</li>
    <li style="margin-bottom: 10px;"><strong>Every morning at 7 AM Stockholm time, 365 days a year.</strong> No missed days, no vacation gaps.</li>
    <li style="margin-bottom: 10px;"><strong>You receive a copy of every send</strong> so you see exactly what your clients see. And you get a weekly performance report every Monday.</li>
  </ul>

  <p style="margin: 32px 0; padding: 20px 24px; background: #fafaf9; border-left: 3px solid #b45309;">
    <strong>The next email from me is a live sample</strong> - today's actual Östermalm Daily, with your name on it. So you can judge the product by what your clients would actually receive tomorrow, not a marketing mockup.
  </p>

  <p><strong>14-day free trial. No charge today.</strong> $999/month after that. Cancel anytime.</p>

  <p>Setup takes about 5 minutes and I've pre-filled the form with your details:</p>

  <p style="margin: 24px 0;">
    <a href="${SETUP_URL}" style="display: inline-block; padding: 14px 28px; background: #1c1917; color: #fafaf9; text-decoration: none; border-radius: 4px; font-size: 14px; letter-spacing: 0.1em; text-transform: uppercase;">Start My 14-Day Free Trial</a>
  </p>

  <p>Want to see another live sample from a different day? <a href="mailto:md@readflaneur.com?subject=${encodeURIComponent(`Send me another ${NEIGHBORHOOD_DISPLAY} sample`)}&body=${encodeURIComponent(`Hi Morgan,\n\nPlease send me another live ${NEIGHBORHOOD_DISPLAY} Daily sample.\n\nThanks,\n${BROKER_NAME}`)}" style="color: #b45309;">Reply and I'll send another one tomorrow morning.</a></p>

  <p>Or see the product live in a different market: <a href="${APP_URL}/new-york/tribeca" style="color: #b45309;">readflaneur.com/new-york/tribeca</a></p>

  <p style="margin-top: 40px;">Best,<br>Morgan Downey<br>Founder, Flaneur<br><a href="mailto:md@readflaneur.com" style="color: #b45309;">md@readflaneur.com</a></p>

  <p style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #e7e5e4; color: #78716c; font-size: 13px;">
    Not interested? No follow-up - just reply "no thanks" and I'll remove you.
  </p>
</div>
`;

async function sendColdPitch() {
  const res = await resend.emails.send({
    from: 'Morgan Downey <md@readflaneur.com>',
    to: TO,
    subject: `A daily newsletter for your Östermalm clients - 14-day free trial`,
    html: coldPitchHtml,
    replyTo: 'md@readflaneur.com',
  });
  console.log('[1/2] Cold pitch send result:', res);
  return res;
}

async function sendPitchPreview() {
  const res = await fetch(`${APP_URL}/api/partner/pitch-preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({
      agentName: BROKER_NAME,
      agentEmail: TO,
      neighborhoodId: NEIGHBORHOOD_ID,
      brokerageName: BROKERAGE,
      agentTitle: 'Senior Broker',
      agentPhone: undefined,
      subscribeUrl: `${APP_URL}/partner`,
    }),
  });
  const data = await res.json();
  console.log('[2/2] Pitch preview status:', res.status, data);
  return data;
}

async function main() {
  console.log('Sending cold pitch to', TO);
  await sendColdPitch();

  // Small delay so the cold pitch arrives first
  await new Promise(r => setTimeout(r, 3000));

  console.log(`Sending live ${NEIGHBORHOOD_DISPLAY} branded Daily Brief preview...`);
  await sendPitchPreview();

  console.log('Done.');
}

main().catch(err => {
  console.error('Send failed:', err);
  process.exit(1);
});
