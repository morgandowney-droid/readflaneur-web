/**
 * Image Library Generator
 *
 * Dual-brain pipeline:
 * 1. Gemini 2.5 Pro "creative director" generates 8 image prompts per neighborhood
 * 2. Imagen 4 generates the actual images
 *
 * Usage:
 * ```ts
 * const result = await generateNeighborhoodLibrary(supabase, neighborhood);
 * ```
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { AI_MODELS } from '@/config/ai-models';
import {
  IMAGE_CATEGORIES,
  ImageCategory,
  getLibraryPath,
} from './image-library';

// ============================================================================
// TYPES
// ============================================================================

interface NeighborhoodInfo {
  id: string;
  name: string;
  city: string;
  country: string | null;
}

interface ImagePrompts {
  'daily-brief-1': string;
  'daily-brief-2': string;
  'daily-brief-3': string;
  'look-ahead-1': string;
  'look-ahead-2': string;
  'look-ahead-3': string;
  'sunday-edition': string;
  'rss-story': string;
}

interface GenerationResult {
  neighborhood_id: string;
  images_generated: number;
  errors: string[];
  prompts: ImagePrompts | null;
}

// ============================================================================
// STEP 1: CREATIVE DIRECTOR (Gemini 2.5 Pro)
// ============================================================================

/**
 * Generate 8 structured image prompts for a neighborhood using Gemini Pro
 * as a "creative director". One API call per neighborhood.
 *
 * Cost: ~$0.01/neighborhood
 */
export async function generateImagePrompts(
  neighborhood: NeighborhoodInfo,
): Promise<ImagePrompts> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error('GEMINI_API_KEY not configured');

  const genai = new GoogleGenAI({ apiKey: geminiKey });

  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'long' });
  const year = now.getFullYear();

  const prompt = `You are the creative director for Flaneur, a luxury neighborhood news publication. Generate 8 image prompts for ${neighborhood.name}, ${neighborhood.city}, ${neighborhood.country || 'unknown country'}.

It is currently ${month} ${year}. Incorporate seasonal context naturally - you know the climate and season for this location.

Each prompt must:
- Reference SPECIFIC, IDENTIFIABLE landmarks, streets, or architectural features of this neighborhood (not generic city shots)
- NEVER include text, words, letters, signs, logos, writing, or human faces
- Be suitable for 16:9 aspect ratio
- Vary the visual style according to the category below

CATEGORIES:
1. daily-brief-1: Hyper-realistic editorial photography. Golden hour light. The most recognizable street or building in ${neighborhood.name}. Warm, inviting, magazine quality.
2. daily-brief-2: Cinematic morning light photography. Recognizable architecture or streetscape at dawn. Crisp, fresh atmosphere. Architectural details prominent.
3. daily-brief-3: Local artist hand-drawn streetscape illustration. Warm watercolor or ink wash style. Intimate, charming view of a characteristic corner or alley.
4. look-ahead-1: Dawn skyline or panoramic view. Anticipatory atmosphere - the neighborhood waking up. Soft pre-sunrise colors. Wide composition.
5. look-ahead-2: Evening street corner. Warm lighting beginning to glow from shops and streetlamps. Transitional twilight moment. Cozy anticipation.
6. look-ahead-3: Elevated or aerial perspective showing urban pattern, rooftops, and street grid of the neighborhood. Geometric beauty from above.
7. sunday-edition: Interior of a characteristic local cafe or breakfast spot. Looking out through the window at the neighborhood. A table with coffee and pastry in foreground, blurred but recognizable neighborhood view beyond. No people.
8. rss-story: THE definitive iconic view of ${neighborhood.name}. The image that says "this IS ${neighborhood.name}" to anyone who knows it. Crystal clear, perfect conditions, the postcard shot.

Return ONLY valid JSON with no markdown formatting:
{"daily-brief-1":"prompt text","daily-brief-2":"prompt text","daily-brief-3":"prompt text","look-ahead-1":"prompt text","look-ahead-2":"prompt text","look-ahead-3":"prompt text","sunday-edition":"prompt text","rss-story":"prompt text"}`;

  const response = await genai.models.generateContent({
    model: AI_MODELS.GEMINI_PRO,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.9,
      responseMimeType: 'application/json',
    },
  });

  const text = response.text?.trim();
  if (!text) throw new Error('Empty response from Gemini Pro');

  // Parse JSON - handle potential markdown code fences
  const cleaned = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  const prompts = JSON.parse(cleaned) as ImagePrompts;

  // Validate all 8 categories are present
  for (const category of IMAGE_CATEGORIES) {
    if (!prompts[category] || typeof prompts[category] !== 'string') {
      throw new Error(`Missing or invalid prompt for category: ${category}`);
    }
  }

  return prompts;
}

// ============================================================================
// STEP 2: IMAGE GENERATION (Imagen 4)
// ============================================================================

/**
 * Generate a single image using Imagen 4 and upload to Supabase storage.
 *
 * Cost: $0.04/image (standard) or $0.02/image (fast)
 */
export async function generateLibraryImage(
  supabase: SupabaseClient,
  neighborhoodId: string,
  category: ImageCategory,
  imagePrompt: string,
  useFastModel = false,
): Promise<{ success: boolean; error?: string }> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return { success: false, error: 'GEMINI_API_KEY not configured' };

  const genai = new GoogleGenAI({ apiKey: geminiKey });
  const model = useFastModel ? AI_MODELS.IMAGEN_FAST : AI_MODELS.IMAGEN;

  try {
    const response = await genai.models.generateImages({
      model,
      prompt: imagePrompt,
      config: {
        numberOfImages: 1,
        aspectRatio: '16:9',
      },
    });

    const image = response.generatedImages?.[0];
    if (!image?.image?.imageBytes) {
      return { success: false, error: 'No image data returned from Imagen' };
    }

    // Upload to Supabase storage
    const storagePath = getLibraryPath(neighborhoodId, category);
    const buffer = Buffer.from(image.image.imageBytes, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(storagePath, buffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      return { success: false, error: `Upload failed: ${uploadError.message}` };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Rate limit or quota errors
    if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
      return { success: false, error: `Rate limited: ${message}` };
    }
    return { success: false, error: message };
  }
}

// ============================================================================
// FULL PIPELINE
// ============================================================================

/**
 * Generate the complete 8-image library for a single neighborhood.
 *
 * Cost: ~$0.33/neighborhood (~$0.01 for prompts + 8 x $0.04 for images)
 * Time: ~25-30s per neighborhood
 */
export async function generateNeighborhoodLibrary(
  supabase: SupabaseClient,
  neighborhood: NeighborhoodInfo,
  options?: {
    useFastModel?: boolean;
    skipExisting?: boolean;
  },
): Promise<GenerationResult> {
  const result: GenerationResult = {
    neighborhood_id: neighborhood.id,
    images_generated: 0,
    errors: [],
    prompts: null,
  };

  // Step 1: Generate prompts
  let prompts: ImagePrompts;
  try {
    prompts = await generateImagePrompts(neighborhood);
    result.prompts = prompts;
  } catch (err) {
    result.errors.push(`Prompt generation failed: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  // Step 2: Check which images already exist (if skipExisting)
  const categoriesToGenerate = [...IMAGE_CATEGORIES];
  if (options?.skipExisting) {
    for (const category of IMAGE_CATEGORIES) {
      const path = getLibraryPath(neighborhood.id, category);
      const { data } = supabase.storage.from('images').getPublicUrl(path);
      if (data?.publicUrl) {
        try {
          const head = await fetch(data.publicUrl, { method: 'HEAD' });
          if (head.ok) {
            const idx = categoriesToGenerate.indexOf(category);
            if (idx >= 0) categoriesToGenerate.splice(idx, 1);
          }
        } catch {
          // Not cached, will regenerate
        }
      }
    }
  }

  // Step 3: Generate images sequentially with rate limit spacing
  for (const category of categoriesToGenerate) {
    const imageResult = await generateLibraryImage(
      supabase,
      neighborhood.id,
      category,
      prompts[category],
      options?.useFastModel,
    );

    if (imageResult.success) {
      result.images_generated++;
    } else {
      result.errors.push(`${category}: ${imageResult.error}`);
      // If rate limited, stop early
      if (imageResult.error?.includes('Rate limited')) {
        result.errors.push('Stopping early due to rate limit');
        break;
      }
    }

    // 2s spacing between API calls for rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Step 4: Update status tracking table
  const now = new Date();
  const season = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  // Get existing count (in case we're adding to partial library)
  const { data: existing } = await supabase
    .from('image_library_status')
    .select('images_generated')
    .eq('neighborhood_id', neighborhood.id)
    .single();

  const totalGenerated = (existing?.images_generated || 0) + result.images_generated;
  const finalCount = Math.min(totalGenerated, IMAGE_CATEGORIES.length);

  await supabase
    .from('image_library_status')
    .upsert({
      neighborhood_id: neighborhood.id,
      images_generated: finalCount,
      last_generated_at: now.toISOString(),
      generation_season: season,
      prompts_json: prompts,
      errors: result.errors.length > 0 ? result.errors : null,
      updated_at: now.toISOString(),
    })
    .then(null, (err: Error) => {
      console.error(`Failed to update library status for ${neighborhood.id}:`, err.message);
    });

  return result;
}
