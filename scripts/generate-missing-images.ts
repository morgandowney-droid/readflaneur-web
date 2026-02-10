/**
 * Generate images for articles missing them
 *
 * Usage: npx tsx scripts/generate-missing-images.ts [limit]
 *
 * Requires GEMINI_API_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env vars from .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

if (!GEMINI_KEY) {
  console.error('Missing GEMINI_API_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genai = new GoogleGenAI({ apiKey: GEMINI_KEY });

async function generateImage(headline: string): Promise<string | null> {
  const prompt = `${headline}

Create a realistic editorial photograph that illustrates this news headline.
Style: Documentary photography, natural lighting, editorial quality.

IMPORTANT: Do NOT include any text, words, letters, signs, logos, or writing in the image.`;

  try {
    const response = await genai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
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

    if (response.candidates && response.candidates.length > 0) {
      const content = response.candidates[0].content;
      if (content?.parts) {
        for (const part of content.parts) {
          if (part.inlineData && part.inlineData.data) {
            return part.inlineData.data;
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Gemini error:', error);
    return null;
  }
}

async function main() {
  const limit = parseInt(process.argv[2] || '5', 10);
  console.log(`\nGenerating images for up to ${limit} articles...\n`);

  // Find articles without images
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, headline, neighborhood_id')
    .eq('status', 'published')
    .or('image_url.is.null,image_url.eq.')
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching articles:', error.message);
    process.exit(1);
  }

  if (!articles || articles.length === 0) {
    console.log('No articles found missing images!');
    return;
  }

  console.log(`Found ${articles.length} articles without images:\n`);

  let success = 0;
  let failed = 0;

  for (const article of articles) {
    console.log(`Processing: ${article.headline.substring(0, 60)}...`);

    const imageData = await generateImage(article.headline);

    if (!imageData) {
      console.log('  ❌ Failed to generate image');
      failed++;
      continue;
    }

    // Upload to Supabase storage
    const buffer = Buffer.from(imageData, 'base64');
    const filePath = `articles/${article.id}.png`;

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(filePath, buffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.log(`  ❌ Upload failed: ${uploadError.message}`);
      failed++;
      continue;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('images')
      .getPublicUrl(filePath);

    // Update article
    const { error: updateError } = await supabase
      .from('articles')
      .update({ image_url: urlData.publicUrl })
      .eq('id', article.id);

    if (updateError) {
      console.log(`  ❌ Update failed: ${updateError.message}`);
      failed++;
      continue;
    }

    console.log(`  ✅ Image generated and saved`);
    success++;

    // Rate limit - wait 2 seconds between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`\n--- Results ---`);
  console.log(`✅ Success: ${success}`);
  console.log(`❌ Failed: ${failed}`);
}

main().catch(console.error);
