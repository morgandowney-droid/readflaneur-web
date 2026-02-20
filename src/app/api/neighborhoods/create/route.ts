import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { AI_MODELS } from '@/config/ai-models';
import { getDistance } from '@/lib/geo-utils';
import { generateCommunityId, generateBriefArticleSlug, generatePreviewText } from '@/lib/community-pipeline';
import { generateNeighborhoodBrief } from '@/lib/grok';
import { enrichBriefWithGemini } from '@/lib/brief-enricher-gemini';
import { performInstantResend } from '@/lib/email/instant-resend';
import { selectLibraryImage } from '@/lib/image-library';
import { generateNeighborhoodLibrary } from '@/lib/image-library-generator';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_COMMUNITY_NEIGHBORHOODS = 2;
const DUPLICATE_RADIUS_KM = 0.5; // 500m

function getSupabaseAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface ValidationResult {
  valid: boolean;
  name: string;
  city: string;
  country: string;
  region: string;
  timezone: string;
  latitude: number;
  longitude: number;
  rejection_reason?: string;
}

/**
 * Validate and normalize a neighborhood using Gemini Flash.
 * Returns structured data if valid, or rejection reason if not.
 */
async function validateWithAI(input: string): Promise<ValidationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const prompt = `You are a geographic validation assistant. The user wants to create a neighborhood page for a local news product.

Validate whether the following input refers to a real, specific neighborhood or district within a city. It must be a walkable urban area (not a country, state, continent, body of water, fictional place, or overly broad region like "Downtown" without a city).

Input: "${input}"

Rules:
- The name should be the commonly used short English name for the neighborhood (e.g., "Tribeca" not "Triangle Below Canal Street")
- If the input includes a city (e.g., "Notting Hill, London"), use that city
- If the input is just a neighborhood name, infer the most likely city
- Return the standard English name, even if the local name differs (but keep well-known local names like "Montmartre")
- Region must be one of: north-america, europe, asia-pacific, middle-east, south-america, africa
- Timezone must be a valid IANA timezone (e.g., "Europe/Paris", "America/New_York")
- Coordinates should be the approximate center of the neighborhood

Return ONLY valid JSON with this exact schema:
{
  "valid": true/false,
  "name": "Neighborhood Name",
  "city": "City Name",
  "country": "Country Name",
  "region": "region-slug",
  "timezone": "IANA/Timezone",
  "latitude": 48.8866,
  "longitude": 2.3431,
  "rejection_reason": "Only if valid is false - explain why"
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.GEMINI_FLASH}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Extract JSON from response (may be wrapped in ```json...```)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No valid JSON in Gemini response');
  }

  return JSON.parse(jsonMatch[0]) as ValidationResult;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Auth check
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Parse input
    const body = await request.json();
    const { input } = body as { input: string };

    if (!input || typeof input !== 'string' || input.trim().length < 3) {
      return NextResponse.json({ error: 'Please enter a neighborhood name (at least 3 characters)' }, { status: 400 });
    }

    if (input.trim().length > 200) {
      return NextResponse.json({ error: 'Input too long (max 200 characters)' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // 3. Limit check
    const { count, error: countError } = await admin
      .from('neighborhoods')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .eq('is_community', true)
      .eq('community_status', 'active');

    if (countError) {
      console.error('Count check error:', countError);
      return NextResponse.json({ error: 'Failed to check neighborhood limit' }, { status: 500 });
    }

    if ((count || 0) >= MAX_COMMUNITY_NEIGHBORHOODS) {
      return NextResponse.json({
        error: `You can create up to ${MAX_COMMUNITY_NEIGHBORHOODS} community neighborhoods. You have reached the limit.`,
      }, { status: 400 });
    }

    // 4. AI validation
    let validation: ValidationResult;
    try {
      validation = await validateWithAI(input.trim());
    } catch (err) {
      console.error('AI validation error:', err);
      return NextResponse.json({ error: 'Failed to validate neighborhood. Please try again.' }, { status: 500 });
    }

    if (!validation.valid) {
      // Log rejection for daily admin digest
      admin
        .from('community_creation_rejections')
        .insert({
          input: input.trim(),
          rejection_reason: validation.rejection_reason || 'Invalid neighborhood',
          user_id: userId,
          user_email: session.user.email || null,
        })
        .then(null, (e: unknown) => console.error('Failed to log rejection:', e));

      return NextResponse.json({
        error: validation.rejection_reason || 'This does not appear to be a valid neighborhood or district.',
      }, { status: 400 });
    }

    // 5. Generate deterministic ID
    const neighborhoodId = generateCommunityId(validation.city, validation.name);

    // 6. Duplicate check - exact ID match
    const { data: exactMatch } = await admin
      .from('neighborhoods')
      .select('id, name, city')
      .eq('id', neighborhoodId)
      .maybeSingle();

    if (exactMatch) {
      return NextResponse.json({
        error: `${exactMatch.name} in ${exactMatch.city} already exists. Try adding it to your collection instead.`,
        existingId: exactMatch.id,
      }, { status: 409 });
    }

    // 7. Duplicate check - proximity (500m)
    if (validation.latitude && validation.longitude) {
      const { data: nearbyNeighborhoods } = await admin
        .from('neighborhoods')
        .select('id, name, city, latitude, longitude')
        .eq('is_active', true)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (nearbyNeighborhoods) {
        for (const n of nearbyNeighborhoods) {
          if (n.latitude != null && n.longitude != null) {
            const dist = getDistance(validation.latitude, validation.longitude, n.latitude, n.longitude);
            if (dist < DUPLICATE_RADIUS_KM) {
              return NextResponse.json({
                error: `Too close to ${n.name} in ${n.city} (${Math.round(dist * 1000)}m away). Try adding that neighborhood instead.`,
                existingId: n.id,
              }, { status: 409 });
            }
          }
        }
      }
    }

    // 8. Insert neighborhood
    const { error: insertError } = await admin
      .from('neighborhoods')
      .insert({
        id: neighborhoodId,
        name: validation.name,
        city: validation.city,
        country: validation.country,
        region: 'community',
        timezone: validation.timezone,
        latitude: validation.latitude,
        longitude: validation.longitude,
        is_active: true,
        is_community: true,
        created_by: userId,
        community_status: 'active',
      });

    if (insertError) {
      console.error('Neighborhood insert error:', insertError);
      // Handle unique constraint violation
      if (insertError.code === '23505') {
        return NextResponse.json({
          error: `${validation.name} in ${validation.city} already exists.`,
        }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create neighborhood' }, { status: 500 });
    }

    // 9. Auto-add to creator's collection
    const { data: maxOrder } = await admin
      .from('user_neighborhood_preferences')
      .select('sort_order')
      .eq('user_id', userId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    await admin
      .from('user_neighborhood_preferences')
      .insert({
        user_id: userId,
        neighborhood_id: neighborhoodId,
        sort_order: (maxOrder?.sort_order || 0) + 1,
      })
      .then(null, (e: unknown) => console.error('Failed to add to collection:', e));

    // 10. Run pipeline (with time budget, each step is try/catch)
    const pipelineStatus = {
      brief: false,
      enrichment: false,
      article: false,
      image: false,
    };

    const timeBudgetMs = 240_000; // 240s for pipeline
    const pipelineStart = Date.now();

    const hasTimeBudget = () => Date.now() - pipelineStart < timeBudgetMs;

    // Step A: Generate brief via Grok
    let briefId: string | null = null;
    let briefContent: string | null = null;
    let briefHeadline: string | null = null;

    if (hasTimeBudget()) {
      try {
        const brief = await generateNeighborhoodBrief(
          validation.name,
          validation.city,
          validation.country,
          undefined,
          validation.timezone,
        );

        if (brief) {
          const { data: insertedBrief } = await admin
            .from('neighborhood_briefs')
            .insert({
              neighborhood_id: neighborhoodId,
              headline: brief.headline,
              content: brief.content,
              source_count: brief.sourceCount || 0,
              ai_model: brief.model || 'grok',
              generated_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (insertedBrief) {
            briefId = insertedBrief.id;
            briefContent = brief.content;
            briefHeadline = brief.headline;
            pipelineStatus.brief = true;
          }
        }
      } catch (err) {
        console.error('Brief generation error:', err);
      }
    }

    // Step B: Enrich with Gemini
    let enrichedContent: string | null = null;
    let enrichedCategories: unknown = null;

    if (hasTimeBudget() && briefContent && briefId) {
      try {
        const enriched = await enrichBriefWithGemini(
          briefContent,
          validation.name,
          neighborhoodId,
          validation.city,
          validation.country,
          { briefGeneratedAt: new Date().toISOString(), timezone: validation.timezone }
        );

        if (enriched) {
          // Build enriched content from categories
          const contentParts: string[] = [];
          if (enriched.categories) {
            for (const cat of enriched.categories) {
              contentParts.push(`**${cat.name}**`);
              for (const story of cat.stories || []) {
                contentParts.push(`${story.entity}: ${story.context}`);
              }
              contentParts.push('');
            }
          }
          enrichedContent = contentParts.join('\n') || null;
          enrichedCategories = enriched.categories || null;

          // Update brief with enriched data
          await admin
            .from('neighborhood_briefs')
            .update({
              enriched_content: enrichedContent || enriched.rawResponse,
              enriched_categories: enrichedCategories,
              enrichment_model: enriched.model,
            })
            .eq('id', briefId)
            .then(null, (e: unknown) => console.error('Failed to update brief enrichment:', e));

          pipelineStatus.enrichment = true;
        }
      } catch (err) {
        console.error('Enrichment error:', err);
      }
    }

    // Step C: Create article
    if (hasTimeBudget() && briefId && (enrichedContent || briefContent)) {
      try {
        const baseHeadline = briefHeadline || `What's Happening in ${validation.name}`;
        const articleHeadline = `${validation.name} DAILY BRIEF: ${baseHeadline}`;
        const articleBody = enrichedContent || briefContent!;
        const slug = generateBriefArticleSlug(articleHeadline, neighborhoodId);
        const previewText = generatePreviewText(articleBody);

        const { error: articleError } = await admin
          .from('articles')
          .insert({
            neighborhood_id: neighborhoodId,
            headline: articleHeadline,
            body_text: articleBody,
            preview_text: previewText,
            slug,
            status: 'published',
            published_at: new Date().toISOString(),
            author_type: 'ai',
            ai_model: 'grok + gemini',
            article_type: 'brief_summary',
            category_label: `${validation.name} Daily Brief`,
            brief_id: briefId,
            image_url: selectLibraryImage(neighborhoodId, 'brief_summary'),
            enriched_at: new Date().toISOString(),
            enrichment_model: 'gemini-2.5-flash',
          });

        if (!articleError) {
          pipelineStatus.article = true;
        }
      } catch (err) {
        console.error('Article creation error:', err);
      }
    }

    // Step D: Generate image library for new community neighborhood
    if (hasTimeBudget()) {
      try {
        const libResult = await generateNeighborhoodLibrary(
          admin,
          {
            id: neighborhoodId,
            name: validation.name,
            city: validation.city,
            country: validation.country,
          },
        );
        if (libResult.photos_found > 0) {
          pipelineStatus.image = true;
        }
      } catch (err) {
        console.error('Image library generation error:', err);
      }
    }

    // 11. Trigger instant resend (fire-and-forget)
    performInstantResend(admin, {
      userId,
      source: 'profile',
      trigger: 'neighborhood_change',
    }).then(null, (e: unknown) => console.error('Instant resend error:', e));

    return NextResponse.json({
      success: true,
      neighborhood: {
        id: neighborhoodId,
        name: validation.name,
        city: validation.city,
        country: validation.country,
        region: 'community',
      },
      pipeline: pipelineStatus,
      elapsed_ms: Date.now() - startTime,
    });
  } catch (err) {
    console.error('Community neighborhood create error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
