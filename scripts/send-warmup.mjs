// Wednesday warmup: send 2 test emails from outreach.readflaneur.com to
// Morgan's personal Gmail to keep the subdomain active with positive
// engagement signal during the 48h pause before Thursday's broker batch.
//
// No broker recipients. Just keeps Gmail's reputation engine seeing continued
// activity from the domain so Thursday's 24-send doesn't feel like a burst.
//
// Run: node scripts/send-warmup.mjs

import { Resend } from 'resend';
import { config } from 'dotenv';
config({ path: '.env.local' });

const resend = new Resend(process.env.RESEND_API_KEY);

const emails = [
  {
    subject: 'Weekly Flaneur note',
    html: `
<div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #1c1917; line-height: 1.7;">
  <p>Morgan,</p>
  <p>Week in review for the Flaneur broker program. Monday's outreach went to 406 targets. 331 delivered, 4 replies so far with one warm lead from a Brooklyn Heights broker.</p>
  <p>The outreach subdomain is warming up. Daily Brief to consumer subscribers continues normally on the main domain.</p>
  <p>Goal for the week: add 10 warm broker subscribers via the flipped funnel.</p>
  <p>Best,<br>Morgan</p>
</div>`,
  },
  {
    subject: 'Quick log - Tuesday',
    html: `
<div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #1c1917; line-height: 1.7;">
  <p>Tuesday session notes.</p>
  <p>Set up outreach.readflaneur.com as a separate sender domain. Auth layer passed. First real-content test landed in Primary after contact-whitelist.</p>
  <p>Thursday will send flipped-funnel touch 2 to 24 curated brokers. Wednesday is warmup-only to the personal inbox.</p>
  <p>Talk tomorrow,<br>Morgan</p>
</div>`,
  },
];

(async () => {
  for (let i = 0; i < emails.length; i++) {
    const e = emails[i];
    const res = await resend.emails.send({
      from: 'Morgan Downey <md@outreach.readflaneur.com>',
      to: 'morgan.downey@gmail.com',
      subject: e.subject,
      html: e.html,
      replyTo: 'md@readflaneur.com',
    });
    console.log(res.error ? `FAIL: ${res.error.message}` : `SENT ${e.subject}  id=${res.data?.id}`);
    if (i < emails.length - 1) await new Promise((r) => setTimeout(r, 3000));
  }
  console.log('\nOpen each in Gmail and mark as "not spam" if any landed there. That compounds warming.');
})();
