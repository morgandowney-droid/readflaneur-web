import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Weekly Digest Generation Cron Job
 *
 * Runs every Monday at 8 AM UTC to generate weekly Property Watch digests
 * with AI-powered summaries for each neighborhood.
 *
 * Schedule: 0 8 * * 1 (8 AM UTC every Monday)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const DIGEST_SYSTEM_PROMPT = `You are The Flâneur's property correspondent. You write weekly neighborhood digests that capture what's changed.

Your style:
- Observant, not breathless
- Connect individual changes to broader trends
- Dry wit when warranted
- No "exciting" or "investment opportunity"
- 2-3 sentences, punchy and informative`;

const DIGEST_PROMPT = (data: {
  neighborhood: string;
  weekStart: string;
  weekEnd: string;
  currency: string;
  forSale: number;
  forRent: number;
  sold: number;
  priceDrops: number;
  newConstruction: number;
  storefrontsOpening: number;
  storefrontsClosing: number;
  medianAskingPrice?: number;
  notableItems: string[];
}) => `Write a 2-3 sentence weekly property digest for ${data.neighborhood} (${data.weekStart} to ${data.weekEnd}):

This week:
- New for sale: ${data.forSale}
- New for rent: ${data.forRent}
- Sold: ${data.sold}
- Price drops: ${data.priceDrops}
- Construction sightings: ${data.newConstruction}
- Storefronts opening: ${data.storefrontsOpening}
- Storefronts closing: ${data.storefrontsClosing}
${data.medianAskingPrice ? `- Median asking: ${data.currency}${data.medianAskingPrice.toLocaleString()}` : ''}

Notable this week:
${data.notableItems.length > 0 ? data.notableItems.join('\n') : 'Nothing particularly notable.'}

Return JSON:
{
  "summary": "Your 2-3 sentence summary here",
  "confidence": 0.0-1.0
}`;

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
    digests_generated: 0,
    neighborhoods_processed: 0,
    neighborhood_stats: [] as { neighborhood: string; activity: number }[],
    errors: [] as string[],
  };

  // Calculate week range (previous 7 days)
  const weekEnd = new Date();
  weekEnd.setHours(0, 0, 0, 0);
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 7);

  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  // Get all configured neighborhoods
  const { data: configs } = await supabase
    .from('neighborhood_property_config')
    .select('neighborhood_id, currency_symbol');

  if (!configs || configs.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No neighborhoods configured',
      ...results,
      timestamp: new Date().toISOString(),
    });
  }

  for (const config of configs) {
    const neighborhoodId = config.neighborhood_id;

    try {
      // Get neighborhood name
      const { data: neighborhood } = await supabase
        .from('neighborhoods')
        .select('name')
        .eq('id', neighborhoodId)
        .single();

      const neighborhoodName = neighborhood?.name || neighborhoodId;
      const currency = config.currency_symbol || '$';

      // Aggregate stats for the week
      // Property sightings
      const { data: sightings } = await supabase
        .from('property_sightings')
        .select('sighting_type, asking_price, ai_summary, is_notable')
        .eq('neighborhood_id', neighborhoodId)
        .gte('created_at', weekStart.toISOString())
        .lt('created_at', weekEnd.toISOString());

      const forSale = sightings?.filter(s => s.sighting_type === 'for_sale').length || 0;
      const forRent = sightings?.filter(s => s.sighting_type === 'for_rent').length || 0;
      const sold = sightings?.filter(s => s.sighting_type === 'sold').length || 0;
      const priceDrops = sightings?.filter(s => s.sighting_type === 'price_drop').length || 0;
      const newConstruction = sightings?.filter(s => s.sighting_type === 'new_construction').length || 0;

      // Storefront changes
      const { data: storefronts } = await supabase
        .from('storefront_changes')
        .select('change_type, ai_summary, business_name')
        .eq('neighborhood_id', neighborhoodId)
        .gte('created_at', weekStart.toISOString())
        .lt('created_at', weekEnd.toISOString());

      const storefrontsOpening = storefronts?.filter(s =>
        s.change_type === 'opening' || s.change_type === 'new_tenant'
      ).length || 0;
      const storefrontsClosing = storefronts?.filter(s =>
        s.change_type === 'closing' || s.change_type === 'closed'
      ).length || 0;

      // Calculate median asking price
      const prices = sightings
        ?.filter(s => s.asking_price && (s.sighting_type === 'for_sale' || s.sighting_type === 'for_rent'))
        .map(s => s.asking_price)
        .sort((a, b) => (a || 0) - (b || 0)) || [];

      const medianAskingPrice = prices.length > 0
        ? prices[Math.floor(prices.length / 2)]
        : undefined;

      // Collect notable items
      const notableItems: string[] = [];

      sightings?.forEach(s => {
        if (s.is_notable && s.ai_summary) {
          notableItems.push(s.ai_summary);
        }
      });

      storefronts?.forEach(s => {
        if (s.ai_summary) {
          notableItems.push(s.ai_summary);
        }
      });

      // Get notable development projects
      const { data: projects } = await supabase
        .from('development_projects')
        .select('ai_summary, is_notable')
        .eq('neighborhood_id', neighborhoodId)
        .eq('is_notable', true)
        .gte('created_at', weekStart.toISOString())
        .lt('created_at', weekEnd.toISOString());

      projects?.forEach(p => {
        if (p.ai_summary) {
          notableItems.push(p.ai_summary);
        }
      });

      // Skip if no activity
      const totalActivity = forSale + forRent + sold + priceDrops + newConstruction +
        storefrontsOpening + storefrontsClosing + (projects?.length || 0);

      if (totalActivity === 0) {
        results.neighborhoods_processed++;
        continue;
      }

      // In dry run mode, just collect stats
      if (isDryRun) {
        results.neighborhood_stats.push({
          neighborhood: neighborhoodName,
          activity: totalActivity,
        });
        results.neighborhoods_processed++;
        continue;
      }

      // Generate AI summary
      const prompt = DIGEST_PROMPT({
        neighborhood: neighborhoodName,
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        currency,
        forSale,
        forRent,
        sold,
        priceDrops,
        newConstruction,
        storefrontsOpening,
        storefrontsClosing,
        medianAskingPrice,
        notableItems: notableItems.slice(0, 5), // Limit to top 5
      });

      const message = await anthropic!.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: DIGEST_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
      const jsonStr = jsonMatch[1]?.trim() || responseText;

      let result;
      try {
        result = JSON.parse(jsonStr);
      } catch {
        results.errors.push(`${neighborhoodId}: Failed to parse AI response`);
        continue;
      }

      // Upsert digest
      await supabase.from('property_watch_digests').upsert({
        neighborhood_id: neighborhoodId,
        week_start: weekStartStr,
        week_end: weekEndStr,
        new_for_sale: forSale,
        new_for_rent: forRent,
        sold_count: sold,
        price_drops: priceDrops,
        new_construction: newConstruction,
        storefronts_opening: storefrontsOpening,
        storefronts_closing: storefrontsClosing,
        median_asking_price: medianAskingPrice,
        ai_summary: result.summary,
        ai_confidence: result.confidence,
        is_published: result.confidence >= 0.6,
        published_at: result.confidence >= 0.6 ? new Date().toISOString() : null,
      }, {
        onConflict: 'neighborhood_id,week_start',
      });

      results.digests_generated++;
      results.neighborhoods_processed++;

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      results.errors.push(`${neighborhoodId}: ${err}`);
    }
  }

  return NextResponse.json({
    success: true,
    week: { start: weekStartStr, end: weekEndStr },
    ...results,
    timestamp: new Date().toISOString(),
  });
}
