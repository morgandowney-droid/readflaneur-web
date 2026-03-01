import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { AI_MODELS } from '@/config/ai-models';
import { getDistance } from '@/lib/geo-utils';
import { generateCommunityId, generateBriefArticleSlug, generatePreviewText } from '@/lib/community-pipeline';
import { enrichBriefWithGemini } from '@/lib/brief-enricher-gemini';
import { performInstantResend } from '@/lib/email/instant-resend';
import { sendEmail } from '@/lib/email';
import { selectLibraryImageAsync } from '@/lib/image-library';
import { generateNeighborhoodLibrary } from '@/lib/image-library-generator';
import { searchNeighborhoodFacts } from '@/lib/gemini-search';
import { insiderPersona } from '@/lib/ai-persona';
import { translateArticle, translateBrief, type LanguageCode } from '@/lib/translation-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_COMMUNITY_NEIGHBORHOODS = 2;
const DUPLICATE_RADIUS_KM = 0.5; // 500m

/**
 * Fallback enricher using Claude when Gemini is unavailable (quota exhausted, etc.)
 * Returns enriched prose or null on failure.
 */
async function enrichWithClaude(
  rawFacts: string,
  neighborhoodName: string,
  city: string,
  country: string,
  timezone: string,
): Promise<{ body: string; subjectTeaser: string | null } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const localDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone,
  });

  const persona = insiderPersona(`${neighborhoodName}, ${city}`, 'Daily Brief Editor');

  const prompt = `${persona}

Rewrite the bullet-point facts below into a polished daily neighborhood brief for ${neighborhoodName}, ${city}, ${country}.

TODAY'S LOCAL DATE: ${localDate}

RULES:
- Start with a greeting in the LOCAL LANGUAGE (e.g., "Buenos dias, vecinos." for Spain, "Bonjour, voisins." for Paris, "God morgon, grannar." for Stockholm, "Morning, neighbors." for English-speaking cities)
- Use [[Double Bracket Section Headers]] for each topic
- Write 1-2 conversational prose paragraphs per section
- Include specific details (addresses, names, prices, times)
- End with a brief sign-off in the local language
- NEVER use em dashes. Use commas, periods, or hyphens instead
- Write in English with 1-2 local language phrases naturally woven in
- Drop any facts you cannot reasonably verify
- Generate a SUBJECT TEASER: 1-4 punchy lowercase words that create curiosity (like "heated school meeting" or "carnival countdown"). Output this on its own line at the very end prefixed with "TEASER:"

RAW FACTS:
${rawFacts}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: AI_MODELS.CLAUDE_SONNET,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('Claude API error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text || '';
    if (!text || text.length < 100) return null;

    // Extract teaser from last line
    let body = text;
    let subjectTeaser: string | null = null;
    const teaserMatch = text.match(/\nTEASER:\s*(.+)$/im);
    if (teaserMatch) {
      subjectTeaser = teaserMatch[1].trim().toLowerCase().replace(/^the\s+/, '');
      body = text.replace(/\nTEASER:\s*.+$/im, '').trim();
    }

    return { body, subjectTeaser };
  } catch (err) {
    console.error('Claude fallback enrichment error:', err);
    return null;
  }
}

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

  const prompt = `You are a geographic validation assistant. The user wants to create a local page for a hyper-local news product.

Validate whether the following input refers to a real, specific place where people live. This can be:
- A neighborhood or district within a city (e.g., "Tribeca", "Notting Hill")
- A small town or municipality (e.g., "Utrera", "Rye", "Potsdam")
- A village or commune (e.g., "Gruyeres", "Fiesole")
- A city or urban area (e.g., "Seville", "Portland")

REJECT only: countries, states/provinces, continents, bodies of water, fictional places, or overly vague inputs like "Downtown" without a city.

Input: "${input}"

Rules:
- The name should be the commonly used short English name (e.g., "Tribeca" not "Triangle Below Canal Street")
- For towns/municipalities that ARE the city, set both name and city to the town name (e.g., name: "Utrera", city: "Utrera")
- For neighborhoods within a city (e.g., "Notting Hill, London"), use the city they belong to
- If the input is ambiguous, infer the most likely location
- Keep well-known local names (e.g., "Montmartre", "Utrera")
- Region must be one of: north-america, europe, asia-pacific, middle-east, south-america, africa
- Timezone must be a valid IANA timezone (e.g., "Europe/Paris", "America/New_York")
- Coordinates should be the approximate center of the location

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

    // 9. Auto-add to creator's collection + sync newsletter_subscribers
    await admin
      .from('user_neighborhood_preferences')
      .insert({
        user_id: userId,
        neighborhood_id: neighborhoodId,
      })
      .then(null, (e: unknown) => console.error('Failed to add to collection:', e));

    // Sync to newsletter_subscribers.neighborhood_ids so crons pick it up for emails
    try {
      const { data: nsub } = await admin
        .from('newsletter_subscribers')
        .select('id, neighborhood_ids')
        .eq('email', session.user.email)
        .maybeSingle();

      if (nsub) {
        const currentIds: string[] = nsub.neighborhood_ids || [];
        if (!currentIds.includes(neighborhoodId)) {
          await admin
            .from('newsletter_subscribers')
            .update({ neighborhood_ids: [...currentIds, neighborhoodId] })
            .eq('id', nsub.id);
        }
      }
    } catch (e) {
      console.error('Failed to sync newsletter_subscribers:', e);
    }

    // 10. Fast pipeline: Gemini Flash with Search (~5-10s) instead of Grok (~25-30s)
    // Image library runs in parallel with brief for speed.
    // The full Grok+enrichment pipeline runs overnight via sync-neighborhood-briefs cron.
    const pipelineStatus = {
      brief: false,
      enrichment: false,
      article: false,
      image: false,
    };

    // Step A + D in parallel: Gemini Search brief + Unsplash image library
    const [factsResult, imageResult] = await Promise.allSettled([
      searchNeighborhoodFacts(
        validation.name,
        validation.city,
        validation.country,
        validation.timezone,
      ),
      generateNeighborhoodLibrary(admin, {
        id: neighborhoodId,
        name: validation.name,
        city: validation.city,
        country: validation.country,
      }),
    ]);

    const facts = factsResult.status === 'fulfilled' ? factsResult.value : null;
    if (imageResult.status === 'fulfilled' && imageResult.value.photos_found > 0) {
      pipelineStatus.image = true;
    }

    // Step B: Create brief from Gemini Search facts
    if (facts && facts.facts) {
      try {
        const headline = `What's Happening in ${validation.name}`;
        const briefDate = new Date().toLocaleDateString('en-CA', { timeZone: validation.timezone });
        const { data: insertedBrief, error: briefInsertError } = await admin
          .from('neighborhood_briefs')
          .insert({
            neighborhood_id: neighborhoodId,
            headline,
            content: facts.facts,
            source_count: facts.sourceCount || 0,
            model: 'gemini-2.5-flash',
            generated_at: new Date().toISOString(),
            brief_date: briefDate,
          })
          .select('id')
          .single();

        // Handle unique constraint violation - fetch existing brief to continue pipeline
        let effectiveBriefId: string | null = insertedBrief?.id || null;
        if (briefInsertError?.code === '23505') {
          const { data: existing } = await admin
            .from('neighborhood_briefs')
            .select('id')
            .eq('neighborhood_id', neighborhoodId)
            .eq('brief_date', briefDate)
            .maybeSingle();
          effectiveBriefId = existing?.id || null;
          console.log(`[create] Brief already exists for ${neighborhoodId} on ${briefDate}, using existing`);
        }

        if (effectiveBriefId) {
          pipelineStatus.brief = true;

          // Step C: Enrich with Gemini (~5-10s) for proper greeting, sections, hyperlinks
          let articleBody = facts.facts;
          let enrichedHeadline = headline;
          let enrichmentModel = 'gemini-2.5-flash';

          try {
            const enriched = await enrichBriefWithGemini(
              facts.facts,
              validation.name,
              neighborhoodId,
              validation.city,
              validation.country,
              { briefGeneratedAt: new Date().toISOString(), timezone: validation.timezone }
            );

            if (enriched) {
              articleBody = enriched.rawResponse || facts.facts;
              enrichmentModel = enriched.model || 'gemini-2.5-flash';

              // Use subject teaser as headline if available
              if (enriched.subjectTeaser) {
                enrichedHeadline = enriched.subjectTeaser
                  .split(' ')
                  .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(' ');
              }

              // Update brief with enriched data
              await admin
                .from('neighborhood_briefs')
                .update({
                  enriched_content: articleBody,
                  enriched_categories: enriched.categories || null,
                  enrichment_model: enrichmentModel,
                  subject_teaser: enriched.subjectTeaser || null,
                })
                .eq('id', effectiveBriefId);

              pipelineStatus.enrichment = true;
            }
          } catch (err) {
            console.error('Gemini enrichment error:', err);
          }

          // Step C2: Claude fallback if Gemini enrichment failed
          if (!pipelineStatus.enrichment) {
            try {
              console.log('Gemini enrichment failed, trying Claude fallback...');
              const claudeResult = await enrichWithClaude(
                facts.facts,
                validation.name,
                validation.city,
                validation.country,
                validation.timezone,
              );

              if (claudeResult) {
                articleBody = claudeResult.body;
                enrichmentModel = AI_MODELS.CLAUDE_SONNET;

                if (claudeResult.subjectTeaser) {
                  enrichedHeadline = claudeResult.subjectTeaser
                    .split(' ')
                    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ');
                }

                await admin
                  .from('neighborhood_briefs')
                  .update({
                    enriched_content: articleBody,
                    enrichment_model: enrichmentModel,
                    subject_teaser: claudeResult.subjectTeaser || null,
                  })
                  .eq('id', effectiveBriefId);

                pipelineStatus.enrichment = true;
                console.log('Claude fallback enrichment succeeded');
              }
            } catch (err) {
              console.error('Claude fallback error (using raw facts):', err);
            }
          }

          // Step D: Create article from enriched (or raw) content
          const articleHeadline = enrichedHeadline;
          const slug = generateBriefArticleSlug(articleHeadline, neighborhoodId);
          const previewText = generatePreviewText(articleBody);

          const { data: insertedArticle, error: articleError } = await admin
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
              ai_model: 'gemini-2.5-flash',
              article_type: 'brief_summary',
              category_label: `${validation.name} Daily Brief`,
              brief_id: effectiveBriefId,
              image_url: await selectLibraryImageAsync(admin, neighborhoodId, 'brief_summary'),
              enriched_at: pipelineStatus.enrichment ? new Date().toISOString() : undefined,
              enrichment_model: pipelineStatus.enrichment ? enrichmentModel : undefined,
            })
            .select('id')
            .single();

          if (!articleError && insertedArticle) {
            pipelineStatus.article = true;

            // Insert sources from enriched categories for attribution
            try {
              const { data: briefData } = await admin
                .from('neighborhood_briefs')
                .select('enriched_categories')
                .eq('id', effectiveBriefId)
                .single();

              const cats = briefData?.enriched_categories as Array<{ stories?: Array<{ source?: { name: string; url?: string }; secondarySource?: { name: string; url?: string } }> }> | null;
              if (cats && Array.isArray(cats)) {
                const sources: { article_id: string; source_name: string; source_type: string; source_url?: string }[] = [];
                const seen = new Set<string>();
                for (const cat of cats) {
                  for (const story of cat.stories || []) {
                    for (const src of [story.source, story.secondarySource]) {
                      if (src?.name && !seen.has(src.name.toLowerCase())) {
                        seen.add(src.name.toLowerCase());
                        const url = src.url;
                        const isValidUrl = url && !url.includes('google.com/search') && url.startsWith('http');
                        sources.push({
                          article_id: insertedArticle.id,
                          source_name: src.name,
                          source_type: src.name.startsWith('@') || url?.includes('x.com') ? 'x_user' : 'publication',
                          source_url: isValidUrl ? url : undefined,
                        });
                      }
                    }
                  }
                }
                if (sources.length > 0) {
                  await admin.from('article_sources').insert(sources).then(null, (e: Error) =>
                    console.error(`Failed to insert sources for community article:`, e)
                  );
                }
              }
            } catch (e) {
              console.error('Source extraction error (non-fatal):', e);
            }
          }

          // Step E: Translate brief + article if user has non-English language
          if (pipelineStatus.enrichment) {
            try {
              const { data: profile } = await admin
                .from('profiles')
                .select('preferred_language')
                .eq('id', userId)
                .maybeSingle();

              const lang = profile?.preferred_language as LanguageCode | null;
              const validLangs: LanguageCode[] = ['sv', 'fr', 'de', 'es', 'pt', 'it', 'zh', 'ja'];

              if (lang && validLangs.includes(lang)) {
                console.log(`Translating brief+article to ${lang} for creator...`);

                const [briefTx, articleTx] = await Promise.allSettled([
                  translateBrief(facts.facts, articleBody, lang),
                  insertedArticle ? translateArticle(articleHeadline, articleBody, previewText, lang) : Promise.resolve(null),
                ]);

                if (briefTx.status === 'fulfilled' && briefTx.value) {
                  await admin.from('brief_translations').upsert({
                    brief_id: effectiveBriefId,
                    language_code: lang,
                    content: briefTx.value.content,
                    enriched_content: briefTx.value.enriched_content,
                  }, { onConflict: 'brief_id,language_code' });
                }

                if (articleTx.status === 'fulfilled' && articleTx.value && insertedArticle) {
                  await admin.from('article_translations').upsert({
                    article_id: insertedArticle.id,
                    language_code: lang,
                    headline: articleTx.value.headline,
                    body: articleTx.value.body,
                    preview_text: articleTx.value.preview_text,
                  }, { onConflict: 'article_id,language_code' });
                }

                console.log(`Translation to ${lang} complete`);
              }
            } catch (err) {
              console.error('Translation error (non-fatal):', err);
            }
          }
        }
      } catch (err) {
        console.error('Brief/article creation error:', err);
      }
    }

    // 11. Send congratulations email (fire-and-forget)
    if (pipelineStatus.article && session.user.email) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\n$/, '').replace(/\/$/, '')
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://readflaneur.com');
      const citySlug = neighborhoodId.split('-')[0];
      const neighborhoodSlug = neighborhoodId.split('-').slice(1).join('-');
      const neighborhoodUrl = `${baseUrl}/${citySlug}/${neighborhoodSlug}`;

      sendEmail({
        to: session.user.email,
        subject: `${validation.name} is live on Flaneur`,
        html: `
          <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 520px; margin: 0 auto; padding: 40px 20px; color: #1c1917;">
            <div style="text-align: center; margin-bottom: 32px;">
              <span style="font-size: 14px; letter-spacing: 0.3em; color: #78716c;">FLANEUR</span>
            </div>
            <h1 style="font-size: 24px; font-weight: 400; text-align: center; margin-bottom: 8px;">
              ${validation.name} is live
            </h1>
            <p style="font-size: 14px; color: #78716c; text-align: center; margin-bottom: 32px;">
              ${validation.city}, ${validation.country}
            </p>
            <p style="font-size: 16px; line-height: 1.7; margin-bottom: 16px;">
              Your first daily brief for ${validation.name} has been published. You can read it now:
            </p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${neighborhoodUrl}" style="display: inline-block; padding: 12px 32px; background: #1c1917; color: #ffffff; text-decoration: none; font-size: 13px; letter-spacing: 0.15em; text-transform: uppercase; border-radius: 8px;">
                Read Your Brief
              </a>
            </div>
            <div style="border-top: 1px solid #e7e5e4; margin: 32px 0; padding-top: 24px;">
              <p style="font-size: 14px; color: #78716c; line-height: 1.6; margin: 0;">
                <strong style="color: #1c1917;">What happens next:</strong> A new daily brief for ${validation.name} will be published every morning at 7 am local time. If you're subscribed to the Daily Brief email, it will be included automatically.
              </p>
            </div>
            <p style="font-size: 12px; color: #a8a29e; text-align: center; margin-top: 32px;">
              <a href="${baseUrl}/feed" style="color: #a8a29e;">readflaneur.com</a>
            </p>
          </div>
        `,
      }).then(null, (e: unknown) => console.error('Congratulations email error:', e));
    }

    // 12. Trigger instant resend (fire-and-forget)
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
