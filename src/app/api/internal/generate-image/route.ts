import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { AI_MODELS } from '@/config/ai-models';

/**
 * Generate a simple SVG placeholder image with neighborhood name
 */
// Headlines that should NEVER get AI-generated images (use placeholder instead)
const SENSITIVE_HEADLINE_PATTERNS = [
  // Violence
  /shooting/i,
  /shot/i,
  /killed/i,
  /murder/i,
  /stabbing/i,
  /stabbed/i,
  /assault/i,
  /attack/i,
  /violence/i,
  /violent/i,
  /dead\b/i,
  /death/i,
  /fatal/i,
  /victim/i,
  /bodycam/i,
  /body\s*cam/i,
  /gun/i,
  /weapon/i,
  /knife/i,
  /blood/i,
  /injured/i,
  /wound/i,
  /homicide/i,
  /manslaughter/i,
  // Sexual/nudity
  /nude/i,
  /naked/i,
  /sex\b/i,
  /sexual/i,
  /prostitut/i,
  /strip\s*club/i,
  /adult\s*entertainment/i,
];

/**
 * Check if headline contains sensitive content that shouldn't be illustrated
 */
function isSensitiveHeadline(headline: string): boolean {
  return SENSITIVE_HEADLINE_PATTERNS.some(pattern => pattern.test(headline));
}

function generatePlaceholderSVG(neighborhoodName: string): string {
  // Escape special characters for SVG
  const escapedName = neighborhoodName
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<svg width="1200" height="675" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <text x="600" y="320" font-family="system-ui, -apple-system, sans-serif" font-size="72" font-weight="300" fill="#ffffff" text-anchor="middle" letter-spacing="8">${escapedName.toUpperCase()}</text>
  <text x="600" y="400" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="#666666" text-anchor="middle" letter-spacing="4">LOCAL NEWS</text>
</svg>`;
}

/**
 * Generate Article Image API
 *
 * POST: Generate an image for an article using Gemini
 *
 * Body: { article_id: string } or { neighborhood_id: string, limit: number }
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Allow cron secret or development mode
  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-cron-secret') === cronSecret ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized && cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return NextResponse.json({
      error: 'GEMINI_API_KEY not configured',
      hint: 'Add GEMINI_API_KEY to your .env.local file'
    }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await request.json();
  const { article_id, neighborhood_id, limit = 5 } = body;

  // Build query - include neighborhood name for fallback
  let query = supabase
    .from('articles')
    .select('id, headline, preview_text, body_text, neighborhood_id, image_url, neighborhood:neighborhoods(name)')
    .eq('status', 'published')
    .or('image_url.is.null,image_url.eq.')
    .order('published_at', { ascending: false });

  if (article_id) {
    query = query.eq('id', article_id);
  } else if (neighborhood_id) {
    query = query.eq('neighborhood_id', neighborhood_id);
  }

  query = query.limit(limit);

  const { data: articles, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!articles || articles.length === 0) {
    return NextResponse.json({
      message: 'No articles found needing images',
      processed: 0,
    });
  }

  const genai = new GoogleGenAI({ apiKey: geminiKey });
  const results: Array<{
    id: string;
    headline: string;
    success: boolean;
    imageUrl?: string;
    error?: string;
  }> = [];

  for (const article of articles) {
    // Check if headline is sensitive - use placeholder instead of AI generation
    if (isSensitiveHeadline(article.headline)) {
      console.log(`Sensitive headline detected, using placeholder: ${article.headline}`);
      try {
        const neighborhoodName = (article.neighborhood as { name?: string } | null)?.name || 'Local News';
        const svgContent = generatePlaceholderSVG(neighborhoodName);
        const svgBuffer = Buffer.from(svgContent, 'utf-8');
        const filePath = `articles/${article.id}.svg`;

        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(filePath, svgBuffer, {
            contentType: 'image/svg+xml',
            upsert: true,
          });

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('images')
            .getPublicUrl(filePath);

          await supabase
            .from('articles')
            .update({ image_url: urlData.publicUrl })
            .eq('id', article.id);

          results.push({
            id: article.id,
            headline: article.headline,
            success: true,
            imageUrl: urlData.publicUrl,
            error: 'Sensitive content - using placeholder',
          });
        }
      } catch (err) {
        results.push({
          id: article.id,
          headline: article.headline,
          success: false,
          error: `Sensitive content placeholder failed: ${err instanceof Error ? err.message : 'Unknown'}`,
        });
      }
      continue;
    }

    try {
      console.log(`Generating image for: ${article.headline}`);

      // Create prompt with strong safety restrictions
      // Per readflaneur.com/standards: "All AI visuals must be stylized artistic renderings"
      const prompt = `${article.headline}

Create a stylized artistic illustration that evokes this news headline.
Style: Editorial illustration, watercolor or gouache painting style, soft artistic rendering.
NOT a photograph - this must be clearly an artistic interpretation.

CRITICAL SAFETY RULES - NEVER include ANY of the following:
- Weapons of any kind (guns, knives, batons, etc.)
- Violence or violent acts
- Blood, injuries, or wounds
- People in distress or danger
- Confrontational scenes
- Police with drawn weapons
- Crime scenes
- Nudity or sexualized content
- Revealing clothing or suggestive poses
- Anything disturbing, graphic, or inappropriate
- Photorealistic human faces or identifiable individuals

IMPORTANT: Do NOT include any text, words, letters, signs, logos, or writing in the image.
Focus on atmospheric, stylized imagery of buildings, streets, community spaces, or abstract representations of the story theme.
The image should be beautiful and evocative, not literal or photographic.`;

      // Generate with Gemini 2.5 Flash Image
      // Per readflaneur.com/standards: stylized artistic renderings, not photorealistic
      const response = await genai.models.generateContent({
        model: AI_MODELS.GEMINI_IMAGE,
        contents: [
          {
            role: 'user',
            parts: [{ text: `Generate a stylized artistic illustration (NOT a photograph): ${prompt}` }],
          },
        ],
        config: {
          responseModalities: ['Image'],
        },
      });

      // Extract image
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
        throw new Error('No image returned from Gemini');
      }

      // Upload to Supabase storage
      const buffer = Buffer.from(imageData, 'base64');
      const ext = mimeType.includes('png') ? 'png' : 'jpg';
      const filePath = `articles/${article.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      const imageUrl = urlData.publicUrl;

      // Update article
      const { error: updateError } = await supabase
        .from('articles')
        .update({ image_url: imageUrl })
        .eq('id', article.id);

      if (updateError) {
        throw new Error(`Update failed: ${updateError.message}`);
      }

      results.push({
        id: article.id,
        headline: article.headline,
        success: true,
        imageUrl,
      });

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`AI image generation failed for ${article.id}:`, error);

      // Generate fallback placeholder with neighborhood name
      try {
        const neighborhoodName = (article.neighborhood as { name?: string } | null)?.name || 'Local News';
        console.log(`Creating placeholder for ${article.headline} with neighborhood: ${neighborhoodName}`);

        const svgContent = generatePlaceholderSVG(neighborhoodName);
        const svgBuffer = Buffer.from(svgContent, 'utf-8');
        const filePath = `articles/${article.id}.svg`;

        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(filePath, svgBuffer, {
            contentType: 'image/svg+xml',
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Placeholder upload failed: ${uploadError.message}`);
        }

        const { data: urlData } = supabase.storage
          .from('images')
          .getPublicUrl(filePath);

        const imageUrl = urlData.publicUrl;

        // Update article with placeholder
        await supabase
          .from('articles')
          .update({ image_url: imageUrl })
          .eq('id', article.id);

        results.push({
          id: article.id,
          headline: article.headline,
          success: true,
          imageUrl,
          error: `AI failed, using placeholder: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      } catch (placeholderError) {
        console.error(`Placeholder also failed for ${article.id}:`, placeholderError);
        results.push({
          id: article.id,
          headline: article.headline,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return NextResponse.json({
    message: `Processed ${results.length} articles`,
    successful,
    failed,
    results,
  });
}
