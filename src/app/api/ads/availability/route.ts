import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBookingPrice } from '@/lib/PricingService';

const BOOKING_LEAD_HOURS = 48;
const BOOKING_MAX_DAYS = 90;

/**
 * GET /api/ads/availability
 *
 * Returns booked/blocked dates and pricing for the booking calendar.
 * No auth required (public).
 *
 * Query params:
 *   month      - YYYY-MM (required)
 *   neighborhood_id - neighborhood slug (required)
 *   type       - 'daily_brief' | 'sunday_edition' (required)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');
  const neighborhoodId = searchParams.get('neighborhood_id');
  const type = searchParams.get('type') as 'daily_brief' | 'sunday_edition' | null;

  if (!month || !neighborhoodId || !type) {
    return NextResponse.json(
      { error: 'Missing required params: month, neighborhood_id, type' },
      { status: 400 }
    );
  }

  if (!['daily_brief', 'sunday_edition'].includes(type)) {
    return NextResponse.json(
      { error: 'type must be daily_brief or sunday_edition' },
      { status: 400 }
    );
  }

  // Parse month
  const monthMatch = month.match(/^(\d{4})-(\d{2})$/);
  if (!monthMatch) {
    return NextResponse.json(
      { error: 'month must be YYYY-MM format' },
      { status: 400 }
    );
  }

  const year = parseInt(monthMatch[1]);
  const monthNum = parseInt(monthMatch[2]);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(year, monthNum, 0).toISOString().split('T')[0]; // last day of month

  // Compute booking window
  const now = new Date();
  const minDate = new Date(now.getTime() + BOOKING_LEAD_HOURS * 60 * 60 * 1000);
  const maxDate = new Date(now.getTime() + BOOKING_MAX_DAYS * 24 * 60 * 60 * 1000);

  const minDateStr = minDate.toISOString().split('T')[0];
  const maxDateStr = maxDate.toISOString().split('T')[0];

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Query booked dates for this neighborhood + type
  const { data: neighborhoodBookings } = await supabase
    .from('ads')
    .select('start_date')
    .eq('neighborhood_id', neighborhoodId)
    .eq('placement_type', type)
    .not('status', 'in', '("rejected","pending_payment")')
    .gte('start_date', monthStart)
    .lte('start_date', monthEnd);

  // Also query global takeover bookings (block that date for everyone)
  const { data: globalBookings } = await supabase
    .from('ads')
    .select('start_date')
    .eq('is_global_takeover', true)
    .eq('placement_type', type)
    .not('status', 'in', '("rejected","pending_payment")')
    .gte('start_date', monthStart)
    .lte('start_date', monthEnd);

  // Clean up stale pending_payment rows (older than 1 hour)
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  await supabase
    .from('ads')
    .delete()
    .eq('status', 'pending_payment')
    .lt('created_at', oneHourAgo);

  // Merge booked dates
  const bookedSet = new Set<string>();
  for (const row of neighborhoodBookings || []) {
    if (row.start_date) bookedSet.add(row.start_date);
  }
  for (const row of globalBookings || []) {
    if (row.start_date) bookedSet.add(row.start_date);
  }

  // Compute blocked dates (outside 48h-90d window)
  const blockedDates: string[] = [];
  const cursor = new Date(year, monthNum - 1, 1);
  const lastDay = new Date(year, monthNum, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    cursor.setDate(d);
    const dateStr = cursor.toISOString().split('T')[0];
    if (dateStr < minDateStr || dateStr > maxDateStr) {
      blockedDates.push(dateStr);
    }
  }

  // Get pricing for this neighborhood + type (using mid-month date for tier resolution)
  const midMonth = new Date(year, monthNum - 1, 15);
  const price = getBookingPrice(neighborhoodId, type, midMonth);

  return NextResponse.json({
    bookedDates: Array.from(bookedSet),
    blockedDates,
    minDate: minDateStr,
    maxDate: maxDateStr,
    price: {
      dailyBrief: price.isGlobal ? price.priceCents : getBookingPrice(neighborhoodId, 'daily_brief', midMonth).priceCents,
      sundayEdition: price.isGlobal ? price.priceCents : getBookingPrice(neighborhoodId, 'sunday_edition', midMonth).priceCents,
      tier: price.tier,
    },
  });
}
