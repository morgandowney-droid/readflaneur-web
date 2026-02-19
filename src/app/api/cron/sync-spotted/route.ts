import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import {
  fetchAllSocialPosts,
  filterSpottedContent,
  getNeighborhoodKeywordsFromDB,
  RawSocialPost,
} from '@/lib/social-sources';
import { AI_MODELS } from '@/config/ai-models';

/**
 * Spotted Items Sync Cron Job
 *
 * Runs every 30 minutes to monitor social media for neighborhood sightings.
 *
 * Schedule: *\/30 * * * * (every 30 minutes)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const SPOTTED_SYSTEM_PROMPT = `You are a well-travelled, successful 35-year-old who has lived in the neighborhood for years. You rewrite tips and sightings as someone who walks these streets daily, in a consistent, anonymous voice.

Your style:
- Write as a knowledgeable insider and long-time resident, never as a tourist or outsider
- Present tense, immediate
- Location-specific ("on Bedford", "corner of Perry and Bleecker") - you know these corners
- Neutral observation, not judgment
- No "OMG" or excited language
- Make readers feel like they're getting real-time intel from a neighbor
- Never use em dashes. Use commas, periods, or hyphens (-) instead.`;

const REWRITE_SPOTTED_PROMPT = (post: RawSocialPost, neighborhood: string) => `Rewrite this social post as a Spotted item for ${neighborhood}:

Original: "${post.content.slice(0, 400)}"
Source: ${post.platform}
Engagement: ${post.engagement || 'unknown'}

Return JSON:
{
  "rewritten": "Your rewrite (max 150 chars, present tense)",
  "category": "restaurant_crowd" | "construction" | "celebrity" | "new_business" | "closure" | "traffic" | "event" | "general",
  "business_name": null or "extracted business name",
  "location_description": null or "on Bedford Ave" style location,
  "sentiment": "positive" | "neutral" | "negative" | "mixed",
  "urgency": "breaking" | "timely" | "evergreen",
  "confidence": 0.0-1.0,
  "should_publish": true/false
}

Reject (should_publish: false) if:
- Personal attacks or identifying individuals negatively
- Unverifiable rumors about crimes
- Promotional/spam content
- Not actually about the neighborhood
- Low quality or unclear`;

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
    posts_fetched: 0,
    posts_filtered: 0,
    items_published: 0,
    sample_posts: [] as { neighborhood: string; content: string; platform: string }[],
    errors: [] as string[],
  };

  // Fetch active neighborhoods from database
  const { data: activeNeighborhoods } = await supabase
    .from('neighborhoods')
    .select('id, name')
    .eq('is_active', true);

  if (!activeNeighborhoods || activeNeighborhoods.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No active neighborhoods to process',
      ...results,
      timestamp: new Date().toISOString(),
    });
  }

  for (const hood of activeNeighborhoods) {
    const neighborhoodId = hood.id;
    const neighborhoodName = hood.name;
    try {
      // Fetch social posts from last 6 hours
      const allPosts = await fetchAllSocialPosts(neighborhoodId, 6);
      results.posts_fetched += allPosts.length;

      // Filter for spotted-worthy content
      const spottedPosts = filterSpottedContent(allPosts);
      results.posts_filtered += spottedPosts.length;

      // In dry run mode, just collect sample posts
      if (isDryRun) {
        for (const post of spottedPosts.slice(0, 3)) {
          results.sample_posts.push({
            neighborhood: neighborhoodName,
            content: post.content.slice(0, 200),
            platform: post.platform,
          });
        }
        results.neighborhoods_processed++;
        continue;
      }

      // Process each post with AI
      for (const post of spottedPosts.slice(0, 20)) { // Limit per neighborhood
        try {
          // Check if already exists (by source and external_id)
          const { data: existing } = await supabase
            .from('spotted_items')
            .select('id, verification_count')
            .eq('source_type', post.platform)
            .eq('source_id', post.external_id)
            .single();

          if (existing) {
            // Increment verification count
            await supabase
              .from('spotted_items')
              .update({
                verification_count: existing.verification_count + 1,
                last_verified_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
            continue;
          }

          // AI processing
          const message = await anthropic!.messages.create({
            model: AI_MODELS.CLAUDE_SONNET,
            max_tokens: 300,
            system: SPOTTED_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: REWRITE_SPOTTED_PROMPT(post, neighborhoodName) }],
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

          if (!result.should_publish) continue;

          // Determine expiration based on urgency
          const expiresAt = new Date();
          if (result.urgency === 'breaking') {
            expiresAt.setHours(expiresAt.getHours() + 4);
          } else if (result.urgency === 'timely') {
            expiresAt.setHours(expiresAt.getHours() + 24);
          } else {
            expiresAt.setDate(expiresAt.getDate() + 7);
          }

          // Insert spotted item
          await supabase.from('spotted_items').insert({
            neighborhood_id: neighborhoodId,
            content: result.rewritten,
            original_content: post.content.slice(0, 1000),
            category: result.category || 'general',
            location_description: result.location_description,
            business_name: result.business_name,
            source_type: post.platform,
            source_url: post.url,
            source_author: post.author,
            source_id: post.external_id,
            verification_status: 'unverified',
            verification_count: 1,
            ai_confidence: result.confidence,
            ai_sentiment: result.sentiment,
            ai_urgency: result.urgency,
            is_published: result.confidence >= 0.7,
            published_at: result.confidence >= 0.7 ? new Date().toISOString() : null,
            is_featured: result.urgency === 'breaking' && result.confidence >= 0.8,
            expires_at: expiresAt.toISOString(),
            spotted_at: post.posted_at,
          });

          if (result.confidence >= 0.7) {
            results.items_published++;
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (err) {
          results.errors.push(`Post ${post.external_id}: ${err}`);
        }
      }

      results.neighborhoods_processed++;
    } catch (err) {
      results.errors.push(`Neighborhood ${neighborhoodId}: ${err}`);
    }
  }

  // Clean up expired items
  const now = new Date().toISOString();
  await supabase
    .from('spotted_items')
    .delete()
    .lt('expires_at', now);

  return NextResponse.json({
    success: true,
    ...results,
    timestamp: new Date().toISOString(),
  });
}
