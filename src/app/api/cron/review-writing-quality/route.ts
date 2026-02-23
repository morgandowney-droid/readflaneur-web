/**
 * Daily Writing Quality Review Cron
 *
 * Samples recent daily briefs and look-ahead articles, sends them to
 * Gemini Pro and Claude for independent editorial analysis against
 * premium newsletter benchmarks, and emails recommendations to admin.
 *
 * Schedule: 0 11 * * * (11 AM UTC daily)
 * Cost: ~$0.27/day (~$8.10/month)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { AI_MODELS } from '@/config/ai-models';
import { getActiveNeighborhoodIds } from '@/lib/active-neighborhoods';
import { sendEmail } from '@/lib/email';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const BRIEF_SAMPLE_COUNT = 3;
const ARTICLE_SAMPLE_COUNT = 3;
const ITEMS_PER_NEIGHBORHOOD = 7;

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function buildAnalysisPrompt(
  briefSamples: { neighborhood: string; content: string }[],
  articleSamples: { neighborhood: string; content: string }[]
): string {
  const briefNeighborhoods = briefSamples.map((s) => s.neighborhood).join(', ');
  const articleNeighborhoods = articleSamples.map((s) => s.neighborhood).join(', ');

  const briefContent = briefSamples
    .map((s) => `--- ${s.neighborhood} ---\n${s.content}`)
    .join('\n\n');

  const articleContent = articleSamples
    .map((s) => `--- ${s.neighborhood} ---\n${s.content}`)
    .join('\n\n');

  return `You are an editorial quality reviewer for Flaneur, a neighborhood newsletter.

BENCHMARKS: FT How To Spend It, Morning Brew, Monocle, Puck, Airmail, Vanity Fair.

Analyze these content samples across two categories:

DAILY BRIEFS (${briefSamples.length} samples from ${briefNeighborhoods}):
${briefContent}

LOOK AHEAD ARTICLES (${articleSamples.length} samples from ${articleNeighborhoods}):
${articleContent}

Provide recommendations in these sections:

1. GROK SEARCH QUERY RECOMMENDATIONS
   What should change about the search queries that gather raw facts?
   (More specific topics? Different time windows? Missing angles?)

2. WRITING PERSONA & STYLE RECOMMENDATIONS
   How should the enrichment persona/style prompts change?
   Compare to benchmark publications. Be specific about tone, structure, word choice.

3. ENGAGEMENT & SHAREABILITY
   What would make readers more likely to share or return daily?
   Consider subject lines, hooks, information gaps, surprising facts.

4. BIGGEST SINGLE IMPROVEMENT
   If you could change one thing, what would have the most impact?

Be specific and actionable. Reference specific samples by neighborhood name.
Include the current prompt/persona text that should change and the suggested replacement.`;
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const genAI = new GoogleGenAI({ apiKey });
  const response = await genAI.models.generateContent({
    model: AI_MODELS.GEMINI_PRO,
    contents: prompt,
    config: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  });

  return response.text || '';
}

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: AI_MODELS.CLAUDE_SONNET,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content[0];
  return block.type === 'text' ? block.text : '';
}

function markdownToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function buildReportEmail(
  briefNeighborhoods: string[],
  articleNeighborhoods: string[],
  geminiAnalysis: string | null,
  claudeAnalysis: string | null,
  geminiError: string | null,
  claudeError: string | null
): string {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const geminiSection = geminiAnalysis
    ? markdownToHtml(geminiAnalysis)
    : `<em style="color:#999;">Failed: ${geminiError || 'Unknown error'}</em>`;

  const claudeSection = claudeAnalysis
    ? markdownToHtml(claudeAnalysis)
    : `<em style="color:#999;">Failed: ${claudeError || 'Unknown error'}</em>`;

  return `
    <div style="font-family: Georgia, serif; max-width: 680px; margin: 0 auto; color: #1c1917;">
      <h1 style="font-size: 24px; margin-bottom: 4px;">Writing Quality Review</h1>
      <p style="color: #888; font-size: 14px; margin-top: 0;">${date}</p>

      <p style="font-size: 14px; color: #666; margin-bottom: 24px;">
        <strong>Daily Brief samples:</strong> ${briefNeighborhoods.join(', ')}<br>
        <strong>Look Ahead samples:</strong> ${articleNeighborhoods.join(', ')}
      </p>

      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">

      <h2 style="font-size: 20px; color: #333;">Gemini Pro Analysis</h2>
      <div style="font-size: 15px; line-height: 1.6; color: #333; margin-bottom: 32px;">
        ${geminiSection}
      </div>

      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">

      <h2 style="font-size: 20px; color: #333;">Claude Analysis</h2>
      <div style="font-size: 15px; line-height: 1.6; color: #333; margin-bottom: 32px;">
        ${claudeSection}
      </div>

      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">
      <p style="font-size: 12px; color: #aaa;">
        Generated by review-writing-quality cron.
        Models: ${AI_MODELS.GEMINI_PRO}, ${AI_MODELS.CLAUDE_SONNET}
      </p>
    </div>
  `;
}

export async function GET(request: Request) {
  const startTime = new Date();
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

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

  try {
    // Get neighborhoods with active subscribers
    const activeIds = await getActiveNeighborhoodIds(supabase);
    const activeArray = Array.from(activeIds);

    if (activeArray.length < BRIEF_SAMPLE_COUNT + ARTICLE_SAMPLE_COUNT) {
      throw new Error(`Not enough active neighborhoods (${activeArray.length})`);
    }

    // Fetch neighborhood names for display
    const { data: neighborhoods } = await supabase
      .from('neighborhoods')
      .select('id, name, city')
      .in('id', activeArray);

    const nameMap = new Map<string, string>();
    if (neighborhoods) {
      for (const n of neighborhoods) {
        nameMap.set(n.id, `${n.name}, ${n.city}`);
      }
    }

    // Pick random neighborhoods - separate sets for briefs and articles
    const briefIds = pickRandom(activeArray, BRIEF_SAMPLE_COUNT);
    const remainingForArticles = activeArray.filter((id) => !briefIds.includes(id));
    const articleIds = pickRandom(remainingForArticles, ARTICLE_SAMPLE_COUNT);

    // Fetch enriched daily briefs (7 most recent per neighborhood)
    const briefSamples: { neighborhood: string; content: string }[] = [];
    for (const id of briefIds) {
      const { data: briefs } = await supabase
        .from('neighborhood_briefs')
        .select('enriched_content, neighborhood_id')
        .eq('neighborhood_id', id)
        .not('enriched_content', 'is', null)
        .order('created_at', { ascending: false })
        .limit(ITEMS_PER_NEIGHBORHOOD);

      if (briefs && briefs.length > 0) {
        const combined = briefs
          .map((b) => b.enriched_content)
          .join('\n\n---\n\n');
        briefSamples.push({
          neighborhood: nameMap.get(id) || id,
          content: combined,
        });
      }
    }

    // Fetch look-ahead articles (7 most recent per neighborhood)
    const articleSamples: { neighborhood: string; content: string }[] = [];
    for (const id of articleIds) {
      const { data: articles } = await supabase
        .from('articles')
        .select('body_text, neighborhood_id')
        .eq('neighborhood_id', id)
        .eq('article_type', 'look_ahead')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(ITEMS_PER_NEIGHBORHOOD);

      if (articles && articles.length > 0) {
        const combined = articles
          .map((a) => a.body_text)
          .join('\n\n---\n\n');
        articleSamples.push({
          neighborhood: nameMap.get(id) || id,
          content: combined,
        });
      }
    }

    if (briefSamples.length === 0 && articleSamples.length === 0) {
      throw new Error('No content samples found');
    }

    // Build the shared analysis prompt
    const prompt = buildAnalysisPrompt(briefSamples, articleSamples);

    // Run both models in parallel
    const [geminiResult, claudeResult] = await Promise.allSettled([
      callGemini(prompt),
      callClaude(prompt),
    ]);

    const geminiAnalysis =
      geminiResult.status === 'fulfilled' ? geminiResult.value : null;
    const claudeAnalysis =
      claudeResult.status === 'fulfilled' ? claudeResult.value : null;
    const geminiError =
      geminiResult.status === 'rejected'
        ? geminiResult.reason instanceof Error
          ? geminiResult.reason.message
          : String(geminiResult.reason)
        : null;
    const claudeError =
      claudeResult.status === 'rejected'
        ? claudeResult.reason instanceof Error
          ? claudeResult.reason.message
          : String(claudeResult.reason)
        : null;

    const briefNeighborhoods = briefSamples.map((s) => s.neighborhood);
    const articleNeighborhoods = articleSamples.map((s) => s.neighborhood);

    // Send email report
    const adminEmail = process.env.ADMIN_EMAIL || 'contact@readflaneur.com';
    const emailHtml = buildReportEmail(
      briefNeighborhoods,
      articleNeighborhoods,
      geminiAnalysis,
      claudeAnalysis,
      geminiError,
      claudeError
    );

    const emailSent = await sendEmail({
      to: adminEmail,
      subject: `Writing Quality Review - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      html: emailHtml,
    });

    // Log to cron_executions
    const responseData = {
      brief_neighborhoods: briefNeighborhoods,
      article_neighborhoods: articleNeighborhoods,
      brief_samples: briefSamples.length,
      article_samples: articleSamples.length,
      gemini_analysis: geminiAnalysis,
      claude_analysis: claudeAnalysis,
      gemini_error: geminiError,
      claude_error: claudeError,
      email_sent: emailSent,
      duration_ms: Date.now() - startTime.getTime(),
    };

    await supabase
      .from('cron_executions')
      .insert({
        job_name: 'review-writing-quality',
        started_at: startTime.toISOString(),
        completed_at: new Date().toISOString(),
        success: true,
        articles_created: 0,
        errors: [geminiError, claudeError].filter(Boolean),
        response_data: responseData,
        triggered_by: 'vercel_cron',
      })
      .then(null, (e: Error) => console.error('Failed to log cron execution:', e));

    return NextResponse.json({
      success: true,
      brief_neighborhoods: briefNeighborhoods,
      article_neighborhoods: articleNeighborhoods,
      gemini: geminiAnalysis ? 'ok' : `failed: ${geminiError}`,
      claude: claudeAnalysis ? 'ok' : `failed: ${claudeError}`,
      email_sent: emailSent,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('review-writing-quality failed:', errorMessage);

    await supabase
      .from('cron_executions')
      .insert({
        job_name: 'review-writing-quality',
        started_at: startTime.toISOString(),
        completed_at: new Date().toISOString(),
        success: false,
        articles_created: 0,
        errors: [errorMessage],
        response_data: { duration_ms: Date.now() - startTime.getTime() },
        triggered_by: 'vercel_cron',
      })
      .then(null, (e: Error) => console.error('Failed to log cron execution:', e));

    return NextResponse.json(
      { error: 'Cron failed', details: errorMessage },
      { status: 500 }
    );
  }
}
