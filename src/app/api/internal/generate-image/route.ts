import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

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

  // Build query
  let query = supabase
    .from('articles')
    .select('id, headline, preview_text, body_text, neighborhood_id, image_url')
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
    try {
      console.log(`Generating image for: ${article.headline}`);

      // Create prompt
      const prompt = `${article.headline}

Create a realistic editorial photograph that illustrates this news headline.
Style: Documentary photography, natural lighting, editorial quality.

IMPORTANT: Do NOT include any text, words, letters, signs, logos, or writing in the image.`;

      // Generate with Gemini
      const response = await genai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: [
          {
            role: 'user',
            parts: [{ text: `Generate a photorealistic editorial photograph: ${prompt}` }],
          },
        ],
        config: {
          responseModalities: ['Image'],  // Capital I for image-only output
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
      console.error(`Failed for ${article.id}:`, error);
      results.push({
        id: article.id,
        headline: article.headline,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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
