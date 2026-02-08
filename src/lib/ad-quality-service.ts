/**
 * Ad Quality Control Service
 *
 * Uses Gemini to:
 * A. Analyze ad images for quality and brand safety
 * B. Polish ad copy to match Flaneur's editorial voice
 */

import { GoogleGenAI } from '@google/genai';
import { SupabaseClient } from '@supabase/supabase-js';

interface ImageAnalysis {
  resolution: 'good' | 'acceptable' | 'poor';
  brandSafe: boolean;
  aestheticScore: number; // 0-100
  issues: string[];
}

interface CopyPolishResult {
  headline: string;
  body: string;
}

/**
 * Analyze an ad image for quality and brand safety
 */
export async function analyzeAdImage(imageUrl: string): Promise<ImageAnalysis | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set, skipping image analysis');
    return null;
  }

  try {
    // Fetch image as base64
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return { resolution: 'poor', brandSafe: true, aestheticScore: 0, issues: ['Image URL not accessible'] };
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: contentType,
                data: base64,
              },
            },
            {
              text: `You are an ad quality reviewer for Flaneur, a luxury neighborhood newsletter. Analyze this ad image and return a JSON object with:

1. "resolution": "good" (sharp, high-res), "acceptable" (usable), or "poor" (blurry, pixelated, tiny)
2. "brandSafe": true/false — false if the image contains explicit content, violence, hate symbols, misleading medical claims, or anything inappropriate for a premium editorial newsletter
3. "aestheticScore": 0-100 — how well this image fits a luxury/editorial context. Consider composition, lighting, professionalism, and brand alignment. Score 70+ for professional brand imagery, 40-69 for acceptable, below 40 for low quality.
4. "issues": string[] — specific problems found (empty array if none)

Return ONLY valid JSON, no markdown or explanation.`,
            },
          ],
        },
      ],
    });

    const text = result.text?.trim() || '';
    const jsonStr = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonStr);

    return {
      resolution: parsed.resolution || 'acceptable',
      brandSafe: parsed.brandSafe !== false,
      aestheticScore: Math.min(100, Math.max(0, Number(parsed.aestheticScore) || 50)),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch (error) {
    console.error('Image analysis error:', error);
    return null;
  }
}

/**
 * Polish ad copy to match Flaneur's editorial voice
 */
export async function polishAdCopy(
  headline: string,
  body: string | undefined
): Promise<CopyPolishResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set, skipping copy polish');
    return null;
  }

  const inputText = [headline, body].filter(Boolean).join('\n\n');
  if (!inputText.trim()) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `You are an editor at Flaneur, a luxury neighborhood newsletter with an editorial voice like The Economist meets Monocle. Rewrite this ad copy to fit our tone.

Rules:
- Remove ALL CAPS words (convert to title case or sentence case)
- Remove exclamation marks
- Remove salesy phrases ("Don't miss out", "Limited time", "Act now", "Best ever", "Incredible deal")
- Keep it concise and understated — luxury whispers, it never shouts
- Preserve the core message and any specific details (prices, dates, locations)
- The headline should be 3-8 words max
- The body (if provided) should be 1-2 sentences max

Input headline: ${headline}
${body ? `Input body: ${body}` : 'No body copy provided.'}

Return ONLY valid JSON with "headline" and "body" fields. If no body was provided, return body as empty string.`,
            },
          ],
        },
      ],
    });

    const text = result.text?.trim() || '';
    const jsonStr = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonStr);

    return {
      headline: parsed.headline || headline,
      body: parsed.body || '',
    };
  } catch (error) {
    console.error('Copy polish error:', error);
    return null;
  }
}

/**
 * Main quality check: runs image analysis + copy polish, updates the ad row
 */
export async function processAdQuality(
  adId: string,
  supabase: SupabaseClient
): Promise<{ success: boolean; autoRejected?: boolean }> {
  // Fetch the ad
  const { data: ad, error: fetchError } = await supabase
    .from('ads')
    .select('*')
    .eq('id', adId)
    .single();

  if (fetchError || !ad) {
    console.error('processAdQuality: ad not found', adId);
    return { success: false };
  }

  // Skip if no creative content at all
  if (!ad.headline && !ad.image_url) {
    // Advance to pending_approval so admin can fill in creative and re-run
    await supabase
      .from('ads')
      .update({ approval_status: 'pending_approval' })
      .eq('id', adId);
    return { success: true };
  }

  const updates: Record<string, unknown> = {};

  // ─── Image Analysis ───
  if (ad.image_url) {
    const imageResult = await analyzeAdImage(ad.image_url);
    if (imageResult) {
      updates.ai_quality_score = imageResult.aestheticScore;

      if (!imageResult.brandSafe) {
        // Auto-reject unsafe content
        updates.status = 'rejected';
        updates.rejection_reason = 'Image flagged for brand safety: ' + imageResult.issues.join(', ');
        updates.ai_flag_reason = imageResult.issues.join(', ');
        updates.approval_status = 'approved'; // terminal state

        await supabase.from('ads').update(updates).eq('id', adId);
        return { success: true, autoRejected: true };
      }

      if (imageResult.issues.length > 0) {
        updates.ai_flag_reason = imageResult.issues.join(', ');
      }
    }
  }

  // ─── Copy Polish ───
  if (ad.headline) {
    const polishResult = await polishAdCopy(ad.headline, ad.body);
    if (polishResult) {
      // Save originals
      updates.original_copy = JSON.stringify({
        headline: ad.headline,
        body: ad.body || '',
      });
      updates.ai_suggested_rewrite = JSON.stringify(polishResult);
    }
  }

  // Advance to pending_approval
  updates.approval_status = 'pending_approval';

  const { error: updateError } = await supabase
    .from('ads')
    .update(updates)
    .eq('id', adId);

  if (updateError) {
    console.error('processAdQuality: update error', updateError);
    return { success: false };
  }

  return { success: true };
}
