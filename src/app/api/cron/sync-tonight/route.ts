import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { fetchAllEvents, NEIGHBORHOOD_COORDS, RawEvent } from '@/lib/event-sources';

/**
 * Tonight Picks Sync Cron Job
 *
 * Runs daily at 2 PM UTC to fetch events for today/tomorrow/weekend
 * and process them with AI curation.
 *
 * Schedule: 0 14 * * * (2 PM UTC daily)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const NEIGHBORHOODS = Object.keys(NEIGHBORHOOD_COORDS);

const TONIGHT_SYSTEM_PROMPT = `You are The Flâneur's events curator. You write enticing one-liners that make readers want to show up.

Your style:
- Urgency without desperation
- Specific details (time, place)
- Insider knowledge implied
- No "Don't miss!" or "Must see!"
- Make the reader feel like they're being let in on something`;

const CURATE_EVENT_PROMPT = (event: RawEvent, neighborhood: string) => `Evaluate and rewrite this event for ${neighborhood} Tonight picks:

Title: ${event.title}
Venue: ${event.venue_name || 'TBD'}
Date: ${event.start_date}
Time: ${event.start_time || 'TBD'}
Description: ${event.description?.slice(0, 300) || 'None'}
Price: ${event.is_free ? 'Free' : event.price_info || 'Unknown'}
Source: ${event.source_platform}

Return JSON:
{
  "rewritten_title": "Your punchy one-liner (max 80 chars)",
  "flaneur_score": 1-10,
  "category": "opening" | "show" | "pop-up" | "market" | "screening" | "party" | "tasting" | "other",
  "should_publish": true/false,
  "rejection_reason": null or "reason",
  "confidence": 0.0-1.0
}

Scoring:
- 8-10: Gallery openings, soft-opens, one-night events, free cultural events
- 5-7: Regular shows, recurring markets, notable venue events
- 1-4: Chain events, generic promos, corporate events`;

export async function GET(request: Request) {
  // Verify cron authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-vercel-cron') === '1' ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const isDryRun = !anthropicApiKey;
  const anthropic = anthropicApiKey ? new Anthropic({ apiKey: anthropicApiKey }) : null;

  const results = {
    dry_run: isDryRun,
    neighborhoods_processed: 0,
    events_fetched: 0,
    events_published: 0,
    sample_events: [] as { neighborhood: string; title: string; venue?: string; date: string }[],
    errors: [] as string[],
  };

  for (const neighborhoodId of NEIGHBORHOODS) {
    try {
      // Fetch events for next 7 days
      const events = await fetchAllEvents(neighborhoodId, 7);
      results.events_fetched += events.length;

      // Get neighborhood name
      const { data: neighborhood } = await supabase
        .from('neighborhoods')
        .select('name')
        .eq('id', neighborhoodId)
        .single();

      const neighborhoodName = neighborhood?.name || neighborhoodId;

      // In dry run mode, just collect sample events
      if (isDryRun) {
        for (const event of events.slice(0, 3)) {
          results.sample_events.push({
            neighborhood: neighborhoodName,
            title: event.title,
            venue: event.venue_name,
            date: event.start_date,
          });
        }
        results.neighborhoods_processed++;
        continue;
      }

      // Process each event with AI
      for (const event of events.slice(0, 30)) { // Limit to 30 per neighborhood
        try {
          // Check if already exists
          const { data: existing } = await supabase
            .from('tonight_picks')
            .select('id')
            .eq('source_platform', event.source_platform)
            .eq('external_id', event.external_id)
            .single();

          if (existing) continue;

          // AI curation
          const message = await anthropic!.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 300,
            system: TONIGHT_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: CURATE_EVENT_PROMPT(event, neighborhoodName) }],
          });

          const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
          const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
          const jsonStr = jsonMatch[1]?.trim() || responseText;

          let result;
          try {
            result = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          // Calculate expiration (end of event day + 2 hours)
          const eventDate = new Date(event.start_date);
          if (event.end_time) {
            const [hours, minutes] = event.end_time.split(':');
            eventDate.setHours(parseInt(hours) + 2, parseInt(minutes));
          } else {
            eventDate.setHours(23, 59, 59);
          }

          // Insert event
          await supabase.from('tonight_picks').insert({
            neighborhood_id: neighborhoodId,
            title: result.rewritten_title || event.title,
            description: event.description?.slice(0, 500),
            venue_name: event.venue_name,
            venue_address: event.venue_address,
            event_date: event.start_date,
            start_time: event.start_time,
            end_time: event.end_time,
            category: result.category || 'other',
            is_free: event.is_free,
            price_info: event.price_info,
            requires_reservation: false,
            reservation_url: event.url,
            source_platform: event.source_platform,
            source_url: event.url,
            external_id: event.external_id,
            flaneur_score: result.flaneur_score,
            ai_confidence: result.confidence,
            ai_rejection_reason: result.rejection_reason,
            is_featured: result.flaneur_score >= 8,
            is_published: result.should_publish && result.confidence >= 0.6,
            published_at: result.should_publish && result.confidence >= 0.6 ? new Date().toISOString() : null,
            expires_at: eventDate.toISOString(),
          });

          if (result.should_publish && result.confidence >= 0.6) {
            results.events_published++;
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          results.errors.push(`Event ${event.external_id}: ${err}`);
        }
      }

      results.neighborhoods_processed++;
    } catch (err) {
      results.errors.push(`Neighborhood ${neighborhoodId}: ${err}`);
    }
  }

  // Clean up expired events
  const now = new Date().toISOString();
  await supabase
    .from('tonight_picks')
    .delete()
    .lt('expires_at', now);

  return NextResponse.json({
    success: true,
    ...results,
    timestamp: new Date().toISOString(),
  });
}
