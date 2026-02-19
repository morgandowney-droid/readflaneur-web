import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { AI_MODELS } from '@/config/ai-models';
import { selectLibraryImage, getLibraryReadyIds, preloadUnsplashCache } from '@/lib/image-library';

/**
 * Neighborhood Guide Digest Generator
 *
 * Runs weekly to generate "What's New" digest articles from guides data.
 * Creates articles about new openings and closures in each neighborhood.
 *
 * Schedule: 0 10 * * 1 (Every Monday at 10 AM UTC)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const DIGEST_SYSTEM_PROMPT = `You are a well-travelled, successful 35-year-old who has lived in the neighborhood for years. You know every corner - the hidden gems, the local drama, the new openings before anyone else does. You write engaging, informative digest articles about what's new.

Your style:
- Write as a knowledgeable insider and long-time resident, never as a tourist or outsider
- You drop specific details that only a local would know (exact addresses, which corner, who owns what)
- Present information conversationally, like telling a friend what's happening in the neighborhood
- Specific details about locations and types of businesses
- No clickbait or excessive enthusiasm
- Present tense, active voice
- 200-400 words for the body
- Do NOT use lowbrow or overly casual words like "ya", "folks", "eats", "grub", "spot" (for restaurant)
- The reader is well-educated and prefers polished language without slang
- Never use em dashes. Use commas, periods, or hyphens (-) instead.
- Never explain what a neighborhood "is" or describe it to outsiders. Assume the reader lives there.`;

const GENERATE_DIGEST_PROMPT = (
  neighborhoodName: string,
  city: string,
  newPlaces: { name: string; category: string; address: string | null; rating: number | null }[],
  closedPlaces: { name: string; category: string; address: string | null }[]
) => `Write a weekly digest article for ${neighborhoodName}, ${city}.

NEW OPENINGS (${newPlaces.length}):
${newPlaces.map(p => `- ${p.name} (${p.category})${p.address ? ` at ${p.address}` : ''}${p.rating ? ` - ${p.rating}★` : ''}`).join('\n') || 'None this week'}

RECENT CLOSURES (${closedPlaces.length}):
${closedPlaces.map(p => `- ${p.name} (${p.category})${p.address ? ` at ${p.address}` : ''}`).join('\n') || 'None this week'}

Return JSON:
{
  "headline": "Catchy headline (max 80 chars, e.g., '3 New Spots Open in ${neighborhoodName}' or '${neighborhoodName} Week in Review')",
  "preview_text": "One sentence teaser (max 150 chars)",
  "body_text": "Full article body in markdown format (200-400 words)",
  "should_publish": true/false (false if no meaningful content)
}

Guidelines:
- If there are new openings, lead with them enthusiastically
- Mention specific business types (café, restaurant, boutique, etc.)
- If there are closures, mention them respectfully ("saying goodbye to...")
- If both, balance the tone
- If neither, set should_publish to false
- Include ratings when notable (4.5+ stars)
- Include a brief closing line inviting readers to explore`;

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

  const libraryReadyIds = await getLibraryReadyIds(supabase);
  await preloadUnsplashCache(supabase);
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return NextResponse.json({
      success: false,
      error: 'ANTHROPIC_API_KEY not configured',
      dry_run: true,
    });
  }

  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  const results = {
    neighborhoods_processed: 0,
    articles_generated: 0,
    skipped_no_content: 0,
    errors: [] as string[],
  };

  // Get date range (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoISO = sevenDaysAgo.toISOString();

  // Get all active neighborhoods with their seeded_at dates
  const { data: neighborhoods, error: neighborhoodError } = await supabase
    .from('neighborhoods')
    .select('id, name, city, seeded_at')
    .eq('is_active', true);

  if (neighborhoodError || !neighborhoods) {
    return NextResponse.json({ error: neighborhoodError?.message || 'No neighborhoods' }, { status: 500 });
  }

  // Get category names for readable output
  const { data: categories } = await supabase
    .from('guide_categories')
    .select('id, name');
  const categoryMap = new Map(categories?.map(c => [c.id, c.name]) || []);

  for (const neighborhood of neighborhoods) {
    try {
      // Skip neighborhoods without seeded_at (not yet seeded)
      if (!neighborhood.seeded_at) continue;

      // Find new places discovered AFTER seeded_at AND within last 7 days
      const { data: newPlaces } = await supabase
        .from('guide_listings')
        .select('name, category_id, address, google_rating')
        .eq('neighborhood_id', neighborhood.id)
        .eq('is_active', true)
        .gt('discovered_at', neighborhood.seeded_at)
        .gte('discovered_at', sevenDaysAgoISO)
        .order('discovered_at', { ascending: false })
        .limit(10);

      // Find recently closed places (within last 7 days)
      const { data: closedPlaces } = await supabase
        .from('guide_listings')
        .select('name, category_id, address')
        .eq('neighborhood_id', neighborhood.id)
        .eq('is_active', false)
        .gte('closed_at', sevenDaysAgoISO)
        .order('closed_at', { ascending: false })
        .limit(10);

      // Skip if no activity
      if ((!newPlaces || newPlaces.length === 0) && (!closedPlaces || closedPlaces.length === 0)) {
        results.skipped_no_content++;
        continue;
      }

      // Format places with category names
      const formattedNew = (newPlaces || []).map(p => ({
        name: p.name,
        category: categoryMap.get(p.category_id) || 'Business',
        address: p.address,
        rating: p.google_rating,
      }));

      const formattedClosed = (closedPlaces || []).map(p => ({
        name: p.name,
        category: categoryMap.get(p.category_id) || 'Business',
        address: p.address,
      }));

      // Generate article with AI
      const message = await anthropic.messages.create({
        model: AI_MODELS.CLAUDE_SONNET,
        max_tokens: 1000,
        system: DIGEST_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: GENERATE_DIGEST_PROMPT(
            neighborhood.name,
            neighborhood.city,
            formattedNew,
            formattedClosed
          ),
        }],
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

      // Parse JSON response
      let result;
      try {
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
        const jsonStr = jsonMatch[1]?.trim() || responseText;
        result = JSON.parse(jsonStr);
      } catch {
        results.errors.push(`${neighborhood.id}: Failed to parse AI response`);
        continue;
      }

      if (!result.should_publish) {
        results.skipped_no_content++;
        continue;
      }

      // Generate deterministic slug from neighborhood + headline (enables dedup)
      const slugInput = `${neighborhood.id}:${result.headline}`;
      let slugHash = 5381;
      for (let i = 0; i < slugInput.length; i++) {
        slugHash = ((slugHash << 5) + slugHash + slugInput.charCodeAt(i)) | 0;
      }
      const slug = `digest-${neighborhood.id}-${Math.abs(slugHash).toString(36)}`;

      // Check if article with this slug already exists (deterministic dedup)
      const { data: existingBySlug } = await supabase
        .from('articles')
        .select('id')
        .eq('slug', slug)
        .limit(1);

      if (existingBySlug && existingBySlug.length > 0) {
        results.skipped_no_content++;
        continue;
      }

      // Also check if similar article already exists this week
      const { data: existing } = await supabase
        .from('articles')
        .select('id')
        .eq('neighborhood_id', neighborhood.id)
        .gte('created_at', sevenDaysAgoISO)
        .or('headline.ilike.%new%open%,headline.ilike.%week%review%,headline.ilike.%what%new%')
        .limit(1);

      if (existing && existing.length > 0) {
        results.skipped_no_content++;
        continue;
      }

      // Insert article with library image
      const { error: insertError } = await supabase
        .from('articles')
        .insert({
          neighborhood_id: neighborhood.id,
          headline: result.headline,
          slug,
          preview_text: result.preview_text,
          body_text: result.body_text,
          image_url: selectLibraryImage(neighborhood.id, 'standard', undefined, libraryReadyIds),
          status: 'published',
          published_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError) {
        results.errors.push(`${neighborhood.id}: ${insertError.message}`);
      } else {
        results.articles_generated++;
      }

      results.neighborhoods_processed++;

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      results.errors.push(`${neighborhood.id}: ${err}`);
    }
  }

  return NextResponse.json({
    success: true,
    ...results,
    timestamp: new Date().toISOString(),
  });
}
