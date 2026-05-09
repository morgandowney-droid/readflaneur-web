import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { render } from '@react-email/components';
import { sendEmail } from '@/lib/email';
import { BrandedDailyBriefTemplate } from '@/lib/email/templates/BrandedDailyBriefTemplate';
import { assembleDailyBrief } from '@/lib/email/assembler';
import { buildSubject } from '@/lib/email/sender';
import { EmailRecipient } from '@/lib/email/types';

export const maxDuration = 30;

// Rate limit windows. Per-IP and per-email both apply; whichever trips first wins.
const PER_IP_WINDOW_HOURS = 1;
const PER_IP_MAX = 3;
const PER_EMAIL_COOLDOWN_HOURS = 24;

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

function clientIpFromRequest(request: NextRequest): string | null {
  const fwd = request.headers.get('x-forwarded-for');
  const real = request.headers.get('x-real-ip');
  const raw = fwd?.split(',')[0]?.trim() || real || null;
  if (!raw) return null;
  if (raw.startsWith('192.168.') || raw.startsWith('10.') || raw === '127.0.0.1' || raw === '::1') {
    return null;
  }
  return raw;
}

// Guess a display name from the email local part. Used so the branded sample
// puts SOMETHING in the "James Chen: Tribeca Daily" from-line slot rather than
// a generic placeholder. The broker can override later in real setup.
function guessNameFromEmail(email: string): string {
  const local = email.split('@')[0] || '';
  const cleaned = local
    .replace(/\d+/g, '')
    .replace(/[._\-+]+/g, ' ')
    .trim();
  if (!cleaned) return 'Your Name';
  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Public lead-capture endpoint. A broker enters their email + picks a
 * neighborhood on /partner; we send them a real branded daily brief sample,
 * write a partner_waitlist row (source='sample_request') for follow-up, and
 * subscribe them to the consumer newsletter for that neighborhood so they
 * start reading the product organically (flipped-funnel strategy, same as
 * touch 2 of broker drip).
 *
 * Rate-limited per IP and per email to prevent inbox-bombing and Resend cost
 * blow-ups. No auth, no captcha — limits do the work.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, neighborhoodId } = await request.json();

    const normalizedEmail = String(email || '').toLowerCase().trim();
    if (!normalizedEmail || !/.+@.+\..+/.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }
    if (!neighborhoodId || typeof neighborhoodId !== 'string') {
      return NextResponse.json({ error: 'Neighborhood required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Rate limit: per-email cooldown
    const emailCutoff = new Date(Date.now() - PER_EMAIL_COOLDOWN_HOURS * 3600_000).toISOString();
    const { count: emailCount } = await supabaseAdmin
      .from('partner_sample_requests')
      .select('id', { count: 'exact', head: true })
      .eq('broker_email', normalizedEmail)
      .gte('created_at', emailCutoff);
    if ((emailCount ?? 0) >= 1) {
      return NextResponse.json(
        { error: `You already requested a sample in the last ${PER_EMAIL_COOLDOWN_HOURS}h. Check your inbox.` },
        { status: 429 }
      );
    }

    // Rate limit: per-IP burst
    const rawIp = clientIpFromRequest(request);
    const ipHash = rawIp ? hashIp(rawIp) : null;
    if (ipHash) {
      const ipCutoff = new Date(Date.now() - PER_IP_WINDOW_HOURS * 3600_000).toISOString();
      const { count: ipCount } = await supabaseAdmin
        .from('partner_sample_requests')
        .select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .gte('created_at', ipCutoff);
      if ((ipCount ?? 0) >= PER_IP_MAX) {
        return NextResponse.json(
          { error: 'Too many sample requests from this network. Try again later.' },
          { status: 429 }
        );
      }
    }

    // Look up neighborhood
    const { data: neighborhood } = await supabaseAdmin
      .from('neighborhoods')
      .select('id, name, city, timezone')
      .eq('id', neighborhoodId)
      .eq('is_active', true)
      .single();

    if (!neighborhood) {
      return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
    }

    // Render the branded sample. Reuses the exact production template + assembler.
    const guessedName = guessNameFromEmail(normalizedEmail);
    const fakeRecipient: EmailRecipient = {
      id: `sample-${Date.now()}`,
      email: normalizedEmail,
      source: 'newsletter',
      timezone: neighborhood.timezone || 'America/New_York',
      primaryNeighborhoodId: neighborhood.id,
      subscribedNeighborhoodIds: [neighborhood.id],
      unsubscribeToken: 'sample-request',
      pausedTopics: [],
    };

    const content = await assembleDailyBrief(supabaseAdmin, fakeRecipient);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/[\n\r]+$/, '').replace(/\/$/, '')
      || 'https://readflaneur.com';

    const agentBranding = {
      agentName: guessedName,
      agentTitle: undefined,
      brokerageName: undefined,
      agentPhone: undefined,
      agentPhotoUrl: undefined,
      listings: [],
      subscribeUrl: `${appUrl}/partner/setup?email=${encodeURIComponent(normalizedEmail)}&neighborhood=${encodeURIComponent(neighborhood.id)}`,
      isPitchPreview: true,
    };

    const html = await render(BrandedDailyBriefTemplate({ ...content, agentBranding }));
    const subject = buildSubject(content);
    const fromAddress = `${guessedName}: ${neighborhood.name} Daily <${neighborhood.id}@readflaneur.com>`;

    const sent = await sendEmail({
      to: normalizedEmail,
      subject,
      html,
      from: fromAddress,
    });

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send sample. Try again.' }, { status: 500 });
    }

    // Log the request for rate limiting + telemetry
    await supabaseAdmin.from('partner_sample_requests').insert({
      broker_email: normalizedEmail,
      neighborhood_id: neighborhood.id,
      ip_hash: ipHash,
    });

    // Lead capture into waitlist (fire-and-forget; unique constraint may dedupe)
    supabaseAdmin
      .from('partner_waitlist')
      .upsert(
        {
          neighborhood_id: neighborhood.id,
          broker_email: normalizedEmail,
          broker_name: guessedName,
          source: 'sample_request',
        },
        { onConflict: 'neighborhood_id,broker_email', ignoreDuplicates: true }
      )
      .then(
        (res) => { if (res.error) console.error('sample-request waitlist upsert failed:', res.error); },
        (err) => console.error('sample-request waitlist upsert rejected:', err)
      );

    // Flipped-funnel: subscribe broker to the consumer newsletter for this
    // neighborhood so they start reading organically. Same logic as drip touch 2.
    supabaseAdmin
      .from('newsletter_subscribers')
      .upsert(
        {
          email: normalizedEmail,
          neighborhood_ids: [neighborhood.id],
          email_verified: false,
        },
        { onConflict: 'email', ignoreDuplicates: true }
      )
      .then(
        (res) => { if (res.error) console.error('sample-request newsletter upsert failed:', res.error); },
        (err) => console.error('sample-request newsletter upsert rejected:', err)
      );

    return NextResponse.json({
      success: true,
      neighborhoodName: neighborhood.name,
      city: neighborhood.city,
    });
  } catch (err) {
    console.error('Sample request error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
