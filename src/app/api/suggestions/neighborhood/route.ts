import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { hashIPSHA256 } from '@/lib/device-detection';
import { notifyNeighborhoodSuggestion } from '@/lib/email';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { suggestion, email } = body as { suggestion?: string; email?: string };

    // Validate suggestion
    if (!suggestion || suggestion.trim().length < 3 || suggestion.trim().length > 200) {
      return NextResponse.json(
        { error: 'Suggestion must be between 3 and 200 characters' },
        { status: 400 }
      );
    }

    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Hash IP for rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const salt = process.env.CRON_SECRET || 'default-salt';
    const ipHash = await hashIPSHA256(ip, salt);

    // Rate limit: 5 per hour per IP
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString();
    const { count } = await getSupabaseAdmin()
      .from('neighborhood_suggestions')
      .select('*', { count: 'exact', head: true })
      .eq('ip_address_hash', ipHash)
      .gte('created_at', windowStart);

    if (count !== null && count >= RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: 'Too many suggestions. Please try again later.' },
        { status: 429 }
      );
    }

    // Detect city/country from Vercel headers
    const city = request.headers.get('x-vercel-ip-city') || null;
    const country = request.headers.get('x-vercel-ip-country') || null;

    // Insert suggestion
    const { error: insertError } = await getSupabaseAdmin()
      .from('neighborhood_suggestions')
      .insert({
        suggestion: suggestion.trim(),
        email: email?.trim() || null,
        ip_address_hash: ipHash,
        city,
        country,
      });

    if (insertError) {
      console.error('Suggestion insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to submit suggestion' },
        { status: 500 }
      );
    }

    // Send email notification (fire-and-forget)
    notifyNeighborhoodSuggestion({
      suggestion: suggestion.trim(),
      email: email?.trim() || null,
      city,
      country,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Suggestion submission error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
