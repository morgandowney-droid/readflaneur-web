import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * @swagger
 * /api/analytics/track:
 *   post:
 *     tags: [Internal]
 *     summary: Log a funnel event
 *     description: Fire-and-forget event logging for email capture and onboarding funnels. Writes to analytics_events. No auth required; anonymous_id comes from client localStorage.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [event]
 *             properties:
 *               event:
 *                 type: string
 *                 description: Event name (e.g. newsletter_signup.view)
 *               properties:
 *                 type: object
 *               anonymous_id:
 *                 type: string
 *               path:
 *                 type: string
 *     responses:
 *       200:
 *         description: Event logged
 *       400:
 *         description: Invalid event
 */

// Allowed event names. Update this list when adding new funnels.
const ALLOWED_EVENTS = new Set([
  // NewsletterSignup component (hero, inline, sidebar, footer variants)
  'newsletter_signup.view',
  'newsletter_signup.submit',
  'newsletter_signup.success',
  'newsletter_signup.error',
  // EmailCaptureCard (feed, after N reads)
  'email_capture.view',
  'email_capture.submit',
  'email_capture.success',
  'email_capture.error',
  'email_capture.dismiss',
  // Onboarding funnel
  'onboard.step1.view',
  'onboard.step1.continue',
  'onboard.step2.view',
  'onboard.step2.google_click',
  'onboard.step2.submit',
  'onboard.step2.success',
  'onboard.step2.error',
  // Ad surfaces (unified across paid/house/bonus; differentiated by ad_type prop)
  // Props: { ad_type: 'paid'|'house'|'bonus', ad_id, surface, variant, placement?, house_ad_type? }
  'ad.impression',
  'ad.click',
]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event, properties = {}, anonymous_id, path } = body;

    if (!event || typeof event !== 'string' || !ALLOWED_EVENTS.has(event)) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const referrer = request.headers.get('referer') || null;
    const userAgent = request.headers.get('user-agent') || null;

    await supabaseAdmin.from('analytics_events').insert({
      event,
      properties,
      anonymous_id: anonymous_id || null,
      path: path || null,
      referrer,
      user_agent: userAgent,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    // Never block the user on analytics failures.
    console.error('[analytics/track] failed:', error);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
