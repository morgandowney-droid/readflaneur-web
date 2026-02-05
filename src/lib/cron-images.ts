/**
 * Cron Image Cache System
 *
 * Provides cached, reusable images for recurring scheduled cron stories
 * to save on Gemini token costs. Instead of generating a unique image
 * for each "Flight Check" or "Scene Watch" article, we use pre-generated
 * category-specific images.
 *
 * Storage: Supabase Storage `images/cron-cache/{category}.png`
 *
 * Usage:
 * ```ts
 * const imageUrl = await getCronImage('route-alert', supabase);
 * // Returns cached URL or generates + caches on first use
 * ```
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

// ============================================================================
// CATEGORY DEFINITIONS
// ============================================================================

export type CronImageCategory =
  | 'route-alert'
  | 'residency-radar'
  | 'fashion-week'
  | 'archive-hunter'
  | 'sample-sale'
  | 'nimby-alert'
  | 'political-wallet'
  | 'review-watch'
  | 'gala-watch'
  | 'retail-watch'
  | 'escape-index'
  | 'nuisance-watch'
  | 'art-fair'
  | 'auction'
  | 'heritage-watch'
  | 'alfresco-watch'
  | 'filming-permit'
  | 'civic-data'
  | 'real-estate'
  | 'museum-watch'
  | 'overture-alert';

interface CategoryConfig {
  prompt: string;
  fallbackColor: string;
  label: string;
}

/**
 * Image generation prompts for each category
 * These are designed to be generic enough to work for any story in the category
 */
export const CRON_IMAGE_CATEGORIES: Record<CronImageCategory, CategoryConfig> = {
  'route-alert': {
    prompt:
      'Elegant airport departure lounge with floor-to-ceiling windows showing aircraft on tarmac at golden hour. Soft natural lighting, modern architecture, empty leather seats, editorial travel photography style. No text or logos.',
    fallbackColor: '#1a365d',
    label: 'FLIGHT CHECK',
  },
  'residency-radar': {
    prompt:
      'Luxurious beachside restaurant terrace at sunset, Mediterranean style with white linens and wicker furniture, azure sea in background. Soft golden light, no people, editorial hospitality photography. No text or logos.',
    fallbackColor: '#065f46',
    label: 'SCENE WATCH',
  },
  'fashion-week': {
    prompt:
      'Empty fashion show runway before a show, dramatic lighting with spotlights, white catwalk, elegant minimal venue. Anticipation atmosphere, editorial fashion photography style. No text, logos, or people.',
    fallbackColor: '#18181b',
    label: 'FASHION WEEK',
  },
  'archive-hunter': {
    prompt:
      'Curated display of vintage luxury handbags and watches in a minimalist boutique setting. Soft museum-quality lighting, velvet displays, editorial still life photography. No text or visible brand logos.',
    fallbackColor: '#78350f',
    label: 'ARCHIVE ALERT',
  },
  'sample-sale': {
    prompt:
      'Elegant clothing racks with designer garments in a bright loft space, morning light streaming through industrial windows. Organized luxury retail, editorial fashion photography. No text, logos, or people.',
    fallbackColor: '#7c2d12',
    label: 'SAMPLE SALE',
  },
  'nimby-alert': {
    prompt:
      'Historic community meeting hall interior, rows of wooden chairs, warm lighting, civic architecture details. Empty room before a meeting, documentary photography style. No text or people.',
    fallbackColor: '#1e3a5f',
    label: 'NIMBY ALERT',
  },
  'political-wallet': {
    prompt:
      'Abstract view of a prestigious city hall or civic building exterior at dusk, columns and architecture, soft evening light. Editorial architectural photography, no text or people.',
    fallbackColor: '#1f2937',
    label: 'POLITICAL WALLET',
  },
  'review-watch': {
    prompt:
      'Elegant restaurant interior, empty table with fine dining place setting, soft candlelight ambiance. White tablecloth, crystal glasses, editorial food photography style. No text, logos, or people.',
    fallbackColor: '#7f1d1d',
    label: 'REVIEW WATCH',
  },
  'gala-watch': {
    prompt:
      'Grand ballroom prepared for charity gala, crystal chandeliers, round tables with floral centerpieces, dramatic lighting. Empty venue before event, editorial event photography. No text or people.',
    fallbackColor: '#581c87',
    label: 'GALA WATCH',
  },
  'retail-watch': {
    prompt:
      'Luxury boutique storefront on a prestigious shopping street, elegant window display, brass details, awning. Golden hour light, editorial retail photography. No text, logos, or people.',
    fallbackColor: '#164e63',
    label: 'RETAIL WATCH',
  },
  'escape-index': {
    prompt:
      'Panoramic mountain view at sunrise, fresh powder snow, clear blue sky, pine trees. Pristine alpine landscape, editorial travel photography style. No text, buildings, or people.',
    fallbackColor: '#0c4a6e',
    label: 'ESCAPE INDEX',
  },
  'nuisance-watch': {
    prompt:
      'Quiet residential neighborhood street at twilight, brownstones and trees, street lamps glowing. Peaceful urban atmosphere, editorial documentary style. No text or people.',
    fallbackColor: '#374151',
    label: 'NUISANCE WATCH',
  },
  'art-fair': {
    prompt:
      'Contemporary art fair booth with white walls, minimalist sculpture on pedestal, gallery lighting. Empty gallery moment, editorial art photography style. No text, people, or recognizable artworks.',
    fallbackColor: '#1c1917',
    label: 'ART FAIR',
  },
  'auction': {
    prompt:
      'Elegant auction house interior, mahogany podium, velvet curtains, soft spotlight on empty easel. Classic prestige atmosphere, editorial photography style. No text, people, or artworks.',
    fallbackColor: '#292524',
    label: 'AUCTION WATCH',
  },
  'heritage-watch': {
    prompt:
      'Historic brownstone building facade with ornate cornice details, morning light, architectural preservation. Documentary architectural photography style. No text or people.',
    fallbackColor: '#44403c',
    label: 'HERITAGE WATCH',
  },
  'alfresco-watch': {
    prompt:
      'Charming sidewalk cafe setup with bistro tables and chairs, potted plants, cafe awning. Morning light, European street atmosphere, editorial photography. No text, logos, or people.',
    fallbackColor: '#166534',
    label: 'AL FRESCO ALERT',
  },
  'filming-permit': {
    prompt:
      'Professional film equipment on a quiet city street, director chairs, lighting rigs, movie trucks in background. Dawn light, documentary style. No text, logos, or people.',
    fallbackColor: '#0f172a',
    label: 'SET LIFE',
  },
  'civic-data': {
    prompt:
      'Modern city hall building exterior with classical columns, American flag, clear blue sky. Civic architecture, documentary photography style. No text or people.',
    fallbackColor: '#1e40af',
    label: 'CIVIC DATA',
  },
  'real-estate': {
    prompt:
      'Elegant townhouse exterior with classic architecture, tree-lined street, iron gate. Golden hour light, editorial real estate photography. No text, logos, or people.',
    fallbackColor: '#0d9488',
    label: 'PROPERTY WATCH',
  },
  'museum-watch': {
    prompt:
      'Grand museum gallery interior with high ceilings, natural light from skylights, empty white walls ready for exhibition. Marble floors, architectural columns, editorial museum photography. No text, people, or artworks.',
    fallbackColor: '#312e81',
    label: 'CULTURE WATCH',
  },
  'overture-alert': {
    prompt:
      'Grand opera house interior before performance, red velvet seats, ornate gold balconies, crystal chandelier, dramatic stage curtain closed. Empty venue, warm lighting, editorial architectural photography. No text or people.',
    fallbackColor: '#7f1d1d',
    label: 'CURTAIN UP',
  },
};

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

const CACHE_BUCKET = 'images';
const CACHE_PATH_PREFIX = 'cron-cache';

/**
 * Get the storage path for a category image
 */
function getCachePath(category: CronImageCategory): string {
  return `${CACHE_PATH_PREFIX}/${category}.png`;
}

/**
 * Check if a cached image exists for a category
 */
async function getCachedImageUrl(
  category: CronImageCategory,
  supabase: SupabaseClient
): Promise<string | null> {
  const path = getCachePath(category);

  // Check if file exists by trying to get its public URL
  // and verifying it returns a valid response
  const { data } = supabase.storage.from(CACHE_BUCKET).getPublicUrl(path);

  if (!data?.publicUrl) return null;

  // Verify the file actually exists with a HEAD request
  try {
    const response = await fetch(data.publicUrl, { method: 'HEAD' });
    if (response.ok) {
      return data.publicUrl;
    }
  } catch {
    // File doesn't exist or network error
  }

  return null;
}

/**
 * Generate and cache a new image for a category
 */
async function generateAndCacheImage(
  category: CronImageCategory,
  supabase: SupabaseClient
): Promise<string | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error('GEMINI_API_KEY not configured for cron image generation');
    return null;
  }

  const config = CRON_IMAGE_CATEGORIES[category];
  const genai = new GoogleGenAI({ apiKey: geminiKey });

  try {
    console.log(`Generating cached image for category: ${category}`);

    const response = await genai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Generate a photorealistic editorial photograph: ${config.prompt}`,
            },
          ],
        },
      ],
      config: {
        responseModalities: ['Image'],
      },
    });

    // Extract image data
    let imageData: string | null = null;
    let mimeType = 'image/png';

    if (response.candidates && response.candidates.length > 0) {
      const content = response.candidates[0].content;
      if (content?.parts) {
        for (const part of content.parts) {
          if (part.inlineData && part.inlineData.data) {
            imageData = part.inlineData.data;
            mimeType = part.inlineData.mimeType || 'image/png';
            break;
          }
        }
      }
    }

    if (!imageData) {
      console.error(`No image returned from Gemini for ${category}`);
      return null;
    }

    // Upload to Supabase storage
    const buffer = Buffer.from(imageData, 'base64');
    const path = getCachePath(category);

    const { error: uploadError } = await supabase.storage
      .from(CACHE_BUCKET)
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: true, // Overwrite if exists
      });

    if (uploadError) {
      console.error(`Failed to upload cached image for ${category}:`, uploadError);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(CACHE_BUCKET).getPublicUrl(path);

    console.log(`Successfully cached image for ${category}: ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (error) {
    console.error(`Error generating cached image for ${category}:`, error);
    return null;
  }
}

/**
 * Generate an SVG placeholder for a category
 */
function generatePlaceholderSVG(category: CronImageCategory): string {
  const config = CRON_IMAGE_CATEGORIES[category];

  return `<svg width="1200" height="675" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${config.fallbackColor};stop-opacity:1" />
      <stop offset="100%" style="stop-color:#000000;stop-opacity:0.8" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <text x="600" y="320" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="300" fill="#ffffff" text-anchor="middle" letter-spacing="8">${config.label}</text>
  <text x="600" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="#888888" text-anchor="middle" letter-spacing="4">THE FLÂNEUR</text>
</svg>`;
}

/**
 * Get or create a cached image URL for a category
 * Falls back to SVG placeholder if image generation fails
 */
export async function getCronImage(
  category: CronImageCategory,
  supabase: SupabaseClient,
  options?: {
    forceRegenerate?: boolean;
    usePlaceholderOnly?: boolean;
  }
): Promise<string> {
  // Option to skip AI generation entirely and use placeholder
  if (options?.usePlaceholderOnly) {
    return uploadPlaceholder(category, supabase);
  }

  // Check cache first (unless force regenerate)
  if (!options?.forceRegenerate) {
    const cachedUrl = await getCachedImageUrl(category, supabase);
    if (cachedUrl) {
      return cachedUrl;
    }
  }

  // Generate and cache new image
  const generatedUrl = await generateAndCacheImage(category, supabase);
  if (generatedUrl) {
    return generatedUrl;
  }

  // Fallback to SVG placeholder
  return uploadPlaceholder(category, supabase);
}

/**
 * Upload SVG placeholder and return URL
 */
async function uploadPlaceholder(
  category: CronImageCategory,
  supabase: SupabaseClient
): Promise<string> {
  const svgContent = generatePlaceholderSVG(category);
  const svgBuffer = Buffer.from(svgContent, 'utf-8');
  const path = `${CACHE_PATH_PREFIX}/${category}-placeholder.svg`;

  const { error: uploadError } = await supabase.storage.from(CACHE_BUCKET).upload(path, svgBuffer, {
    contentType: 'image/svg+xml',
    upsert: true,
  });

  if (uploadError) {
    console.error(`Failed to upload placeholder for ${category}:`, uploadError);
    // Return a data URL as absolute last resort
    return `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;
  }

  const { data: urlData } = supabase.storage.from(CACHE_BUCKET).getPublicUrl(path);
  return urlData.publicUrl;
}

/**
 * Pre-generate all category images (for initial setup or refresh)
 * Call this from an admin endpoint or script
 */
export async function pregenerateAllCronImages(
  supabase: SupabaseClient
): Promise<Record<CronImageCategory, { success: boolean; url?: string; error?: string }>> {
  const results: Record<
    CronImageCategory,
    { success: boolean; url?: string; error?: string }
  > = {} as Record<CronImageCategory, { success: boolean; url?: string; error?: string }>;

  for (const category of Object.keys(CRON_IMAGE_CATEGORIES) as CronImageCategory[]) {
    try {
      const url = await getCronImage(category, supabase, { forceRegenerate: true });
      results[category] = { success: true, url };

      // Rate limit between generations
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error) {
      results[category] = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  return results;
}

/**
 * Get all cached image URLs (for admin/debugging)
 */
export async function listCachedCronImages(
  supabase: SupabaseClient
): Promise<Record<CronImageCategory, string | null>> {
  const results: Record<CronImageCategory, string | null> = {} as Record<
    CronImageCategory,
    string | null
  >;

  for (const category of Object.keys(CRON_IMAGE_CATEGORIES) as CronImageCategory[]) {
    results[category] = await getCachedImageUrl(category, supabase);
  }

  return results;
}
