import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 1x1 transparent PNG
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * @swagger
 * /api/email/pixel:
 *   get:
 *     tags: [Email]
 *     summary: Email open tracking pixel
 *     description: 1x1 transparent PNG that marks a newsletter subscriber as email_verified when loaded. Embedded in daily brief emails.
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Subscriber's unsubscribe token
 *     responses:
 *       200:
 *         description: 1x1 transparent PNG
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (token) {
    // Fire-and-forget: mark subscriber as verified
    supabaseAdmin
      .from('newsletter_subscribers')
      .update({ email_verified: true })
      .eq('unsubscribe_token', token)
      .eq('email_verified', false)
      .then(null, () => {});
  }

  return new NextResponse(PIXEL, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
