import { NextRequest, NextResponse } from 'next/server';

/**
 * @swagger
 * /api/account/newsletter-status:
 *   get:
 *     summary: Check newsletter subscription status
 *     description: Checks whether an email address is subscribed to the newsletter. Uses service role key so it works regardless of session state.
 *     tags:
 *       - Account
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         description: Email address to check subscription status for
 *     responses:
 *       200:
 *         description: Subscription status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscribed:
 *                   type: boolean
 *       500:
 *         description: Database query failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ subscribed: false });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const res = await fetch(
      `${supabaseUrl}/rest/v1/newsletter_subscribers?select=id&email=eq.${encodeURIComponent(email.toLowerCase().trim())}&limit=1`,
      {
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        subscribed: Array.isArray(data) && data.length > 0,
      });
    }

    return NextResponse.json({ subscribed: false });
  } catch {
    return NextResponse.json({ subscribed: false });
  }
}
