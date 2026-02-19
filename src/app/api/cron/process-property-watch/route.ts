import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { AI_MODELS } from '@/config/ai-models';

/**
 * Property Watch Processing Cron Job
 *
 * Runs daily at 7 AM UTC to process user-submitted property sightings
 * and storefront changes with AI summaries.
 *
 * Schedule: 0 7 * * * (7 AM UTC daily)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const PROPERTY_WATCH_SYSTEM_PROMPT = `You are a well-travelled, successful 35-year-old who has lived in the neighborhood for years. You write observant, street-level commentary about real estate and development changes as someone who walks these blocks daily.

Your style:
- Write as a knowledgeable insider and long-time resident, never as a tourist or outsider
- Notice what others miss: scaffolding, for-sale signs, permits in windows
- Dry observations, not breathless real estate copy
- Connect individual changes to neighborhood trends you've watched unfold
- No "investment opportunity" or "charming" or "must-see"
- Skeptical of developer promises
- Never use em dashes. Use commas, periods, or hyphens (-) instead.
- Never explain what a neighborhood "is" or describe it to outsiders. Assume the reader lives there.`;

const SIGHTING_PROMPT = (sighting: any, neighborhood: string, currency: string) => `Write a one-liner (max 100 chars) about this property sighting in ${neighborhood}:

Type: ${sighting.sighting_type}
Address: ${sighting.address || sighting.location_description || 'Unknown location'}
${sighting.asking_price ? `Price: ${currency}${sighting.asking_price.toLocaleString()}` : ''}
${sighting.description ? `Notes: ${sighting.description}` : ''}

Return JSON:
{
  "summary": "Your one-liner here",
  "is_notable": true/false,
  "confidence": 0.0-1.0
}`;

const STOREFRONT_PROMPT = (change: any, neighborhood: string) => `Write a one-liner (max 100 chars) about this storefront change in ${neighborhood}:

Type: ${change.change_type}
Address: ${change.address}
Business: ${change.business_name || 'Unknown'}
${change.previous_business_name ? `Previously: ${change.previous_business_name}` : ''}
${change.description ? `Notes: ${change.description}` : ''}

Return JSON:
{
  "summary": "Your one-liner here",
  "is_notable": true/false,
  "confidence": 0.0-1.0
}`;

const PROJECT_PROMPT = (project: any, neighborhood: string) => `Write a one-liner (max 120 chars) about this development in ${neighborhood}:

Type: ${project.project_type}
Status: ${project.status}
Address: ${project.address}
${project.floors ? `Floors: ${project.floors}` : ''}
${project.units ? `Units: ${project.units}` : ''}
${project.description ? `Notes: ${project.description}` : ''}

Return JSON:
{
  "summary": "Your one-liner here",
  "is_notable": true/false,
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
    sightings: { processed: 0, published: 0, pending: 0 },
    storefronts: { processed: 0, published: 0, pending: 0 },
    projects: { processed: 0, published: 0, pending: 0 },
    errors: [] as string[],
  };

  // Process property sightings
  const { data: sightings } = await supabase
    .from('property_sightings')
    .select('*')
    .eq('is_published', false)
    .is('ai_summary', null)
    .limit(50);

  results.sightings.pending = sightings?.length || 0;

  if (isDryRun) {
    // Skip AI processing in dry run
  } else {
    for (const sighting of sightings || []) {
      try {
        const { data: neighborhood } = await supabase
          .from('neighborhoods')
          .select('name')
          .eq('id', sighting.neighborhood_id)
          .single();

        const { data: config } = await supabase
          .from('neighborhood_property_config')
          .select('currency_symbol')
          .eq('neighborhood_id', sighting.neighborhood_id)
          .single();

        const prompt = SIGHTING_PROMPT(
          sighting,
          neighborhood?.name || sighting.neighborhood_id,
          config?.currency_symbol || '$'
        );

        const message = await anthropic!.messages.create({
        model: AI_MODELS.CLAUDE_SONNET,
        max_tokens: 200,
        system: PROPERTY_WATCH_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
      const result = JSON.parse(jsonMatch[1]?.trim() || responseText);

      await supabase
        .from('property_sightings')
        .update({
          ai_summary: result.summary,
          ai_confidence: result.confidence,
          is_notable: result.is_notable,
          is_published: result.confidence >= 0.6,
          published_at: result.confidence >= 0.6 ? new Date().toISOString() : null,
        })
        .eq('id', sighting.id);

        results.sightings.processed++;
        if (result.confidence >= 0.6) results.sightings.published++;

        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        results.errors.push(`Sighting ${sighting.id}: ${err}`);
      }
    }
  }

  // Process storefront changes
  const { data: storefronts } = await supabase
    .from('storefront_changes')
    .select('*')
    .eq('is_published', false)
    .is('ai_summary', null)
    .limit(50);

  results.storefronts.pending = storefronts?.length || 0;

  if (!isDryRun) {
    for (const storefront of storefronts || []) {
      try {
        const { data: neighborhood } = await supabase
          .from('neighborhoods')
          .select('name')
          .eq('id', storefront.neighborhood_id)
          .single();

        const prompt = STOREFRONT_PROMPT(storefront, neighborhood?.name || storefront.neighborhood_id);

        const message = await anthropic!.messages.create({
          model: AI_MODELS.CLAUDE_SONNET,
          max_tokens: 200,
          system: PROPERTY_WATCH_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });

        const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
        const result = JSON.parse(jsonMatch[1]?.trim() || responseText);

        await supabase
          .from('storefront_changes')
          .update({
            ai_summary: result.summary,
            ai_confidence: result.confidence,
            is_published: result.confidence >= 0.6,
            published_at: result.confidence >= 0.6 ? new Date().toISOString() : null,
          })
          .eq('id', storefront.id);

        results.storefronts.processed++;
        if (result.confidence >= 0.6) results.storefronts.published++;

        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        results.errors.push(`Storefront ${storefront.id}: ${err}`);
      }
    }
  }

  // Process development projects
  const { data: projects } = await supabase
    .from('development_projects')
    .select('*')
    .eq('is_published', false)
    .is('ai_summary', null)
    .limit(50);

  results.projects.pending = projects?.length || 0;

  if (!isDryRun) {
    for (const project of projects || []) {
      try {
        const { data: neighborhood } = await supabase
          .from('neighborhoods')
          .select('name')
          .eq('id', project.neighborhood_id)
          .single();

        const prompt = PROJECT_PROMPT(project, neighborhood?.name || project.neighborhood_id);

        const message = await anthropic!.messages.create({
          model: AI_MODELS.CLAUDE_SONNET,
          max_tokens: 200,
          system: PROPERTY_WATCH_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });

        const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
        const result = JSON.parse(jsonMatch[1]?.trim() || responseText);

        await supabase
          .from('development_projects')
          .update({
            ai_summary: result.summary,
            ai_confidence: result.confidence,
            is_notable: result.is_notable,
            is_published: result.confidence >= 0.6,
            published_at: result.confidence >= 0.6 ? new Date().toISOString() : null,
          })
          .eq('id', project.id);

        results.projects.processed++;
        if (result.confidence >= 0.6) results.projects.published++;

        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        results.errors.push(`Project ${project.id}: ${err}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    ...results,
    timestamp: new Date().toISOString(),
  });
}
