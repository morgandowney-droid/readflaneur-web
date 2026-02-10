/**
 * AI Model Update Checker Cron Job
 *
 * Checks for new model releases and deprecations across all three AI providers:
 * - Gemini: Uses the models.list API for concrete data
 * - Anthropic, xAI/Grok: Uses Grok web search for recent announcements
 *
 * Creates cron_issues of type 'model_update_available' for admin review.
 *
 * Schedule: Monthly on the 1st at 9:00 AM UTC
 * Vercel Cron: 0 9 1 * *
 * Cost: ~$0.015/month (3 Grok web search calls)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AI_MODELS } from '@/config/ai-models';
import { generateWithGrok } from '@/lib/grok';

export const runtime = 'nodejs';
export const maxDuration = 300;

const TIME_BUDGET_MS = 270_000; // 270s - leave 30s for logging

interface GeminiModel {
  name: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
}

interface GeminiModelsResponse {
  models: GeminiModel[];
  nextPageToken?: string;
}

interface WebSearchFinding {
  finding_type: 'new_model' | 'deprecation' | 'update' | 'pricing_change';
  model_name: string;
  summary: string;
  relevance: 'high' | 'medium' | 'low';
  source_url?: string;
}

// Extract model family by stripping version numbers
// e.g. "gemini-2.5-flash" -> "gemini-flash", "gemini-3-pro-preview" -> "gemini-pro"
function getModelFamily(modelId: string): string {
  return modelId
    .replace(/models\//, '')
    .replace(/-\d+[\d.]*(-\d+)?/g, '')  // strip version segments
    .replace(/--+/g, '-')               // collapse double dashes
    .replace(/-$/, '');                  // strip trailing dash
}

// Check if a Gemini model is newer than our current one in the same family
function isNewerInFamily(candidateName: string, currentId: string): boolean {
  const candidateFamily = getModelFamily(candidateName);
  const currentFamily = getModelFamily(currentId);
  if (candidateFamily !== currentFamily) return false;

  // Strip "models/" prefix for comparison
  const candidate = candidateName.replace(/^models\//, '');
  return candidate !== currentId && candidate > currentId;
}

export async function GET(request: Request) {
  const functionStart = Date.now();
  const startedAt = new Date().toISOString();

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

  const results = {
    gemini_api: {
      models_found: 0,
      our_models_status: {} as Record<string, 'found' | 'not_found'>,
      newer_versions: [] as string[],
      errors: [] as string[],
    },
    web_search: {
      queries_run: 0,
      findings: [] as WebSearchFinding[],
      errors: [] as string[],
    },
    issues_created: 0,
    current_models: { ...AI_MODELS },
    errors: [] as string[],
  };

  try {
    // ── Phase 1: Gemini models.list API ──────────────────────────────
    if (process.env.GEMINI_API_KEY) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}&pageSize=100`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);

        if (response.ok) {
          const data: GeminiModelsResponse = await response.json();
          const models = data.models || [];
          results.gemini_api.models_found = models.length;

          const modelNames = models.map(m => m.name.replace(/^models\//, ''));

          // Check if our models still exist
          const geminiModels = {
            GEMINI_FLASH: AI_MODELS.GEMINI_FLASH,
            GEMINI_PRO: AI_MODELS.GEMINI_PRO,
            GEMINI_IMAGE: AI_MODELS.GEMINI_IMAGE,
          };

          for (const [key, modelId] of Object.entries(geminiModels)) {
            const found = modelNames.some(name => name === modelId || name.startsWith(modelId));
            results.gemini_api.our_models_status[key] = found ? 'found' : 'not_found';
          }

          // Check for newer versions in same families
          for (const [, modelId] of Object.entries(geminiModels)) {
            for (const apiModel of models) {
              if (isNewerInFamily(apiModel.name, modelId)) {
                const cleanName = apiModel.name.replace(/^models\//, '');
                if (!results.gemini_api.newer_versions.includes(cleanName)) {
                  results.gemini_api.newer_versions.push(cleanName);
                }
              }
            }
          }
        } else {
          const errorText = await response.text();
          results.gemini_api.errors.push(`API returned ${response.status}: ${errorText.slice(0, 200)}`);
        }
      } catch (err) {
        results.gemini_api.errors.push(
          err instanceof Error ? err.message : String(err)
        );
      }
    } else {
      results.gemini_api.errors.push('GEMINI_API_KEY not configured');
    }

    // ── Phase 2: Grok web search (3 providers) ──────────────────────
    const elapsed = () => Date.now() - functionStart;

    const providers = [
      {
        name: 'Anthropic',
        models: `Claude Sonnet: ${AI_MODELS.CLAUDE_SONNET}, Claude Haiku: ${AI_MODELS.CLAUDE_HAIKU}`,
        searchTerms: 'Anthropic Claude API model',
      },
      {
        name: 'Google Gemini',
        models: `Flash: ${AI_MODELS.GEMINI_FLASH}, Pro: ${AI_MODELS.GEMINI_PRO}, Image: ${AI_MODELS.GEMINI_IMAGE}`,
        searchTerms: 'Google Gemini API model',
      },
      {
        name: 'xAI Grok',
        models: `Grok Fast: ${AI_MODELS.GROK_FAST}`,
        searchTerms: 'xAI Grok API model',
      },
    ];

    const systemPrompt = `You are an AI model release tracker. Analyze web search results and return ONLY valid JSON (no markdown fences). Return findings about model releases, deprecations, or significant updates.

Output format:
{"findings": [{"finding_type": "new_model" | "deprecation" | "update" | "pricing_change", "model_name": "model-id", "summary": "Brief description", "relevance": "high" | "medium" | "low", "source_url": "https://..."}]}

Rules:
- Only include findings from the last 30 days
- "high" relevance = direct replacement or deprecation of a model we use
- "medium" relevance = new model in same family or notable capability upgrade
- "low" relevance = minor updates, beta releases, unrelated models
- If nothing notable found, return {"findings": []}`;

    for (const provider of providers) {
      if (elapsed() > TIME_BUDGET_MS - 60_000) {
        results.web_search.errors.push(`Skipped ${provider.name}: time budget exhausted`);
        continue;
      }

      try {
        const prompt = `Search for the latest ${provider.searchTerms} releases or deprecations in the last 30 days. We currently use: ${provider.models}. What new models have been released, deprecated, or updated?`;

        const response = await generateWithGrok(prompt, {
          systemPrompt,
          enableSearch: true,
          temperature: 0.3,
        });

        results.web_search.queries_run++;

        if (response) {
          // Strip markdown fences if present
          const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          try {
            const parsed = JSON.parse(cleaned);
            const findings: WebSearchFinding[] = (parsed.findings || []).filter(
              (f: WebSearchFinding) => f.relevance === 'high' || f.relevance === 'medium'
            );
            results.web_search.findings.push(...findings);
          } catch {
            // If JSON parse fails, note it but don't crash
            results.web_search.errors.push(
              `${provider.name}: Could not parse response as JSON`
            );
          }
        } else {
          results.web_search.errors.push(`${provider.name}: No response from Grok`);
        }
      } catch (err) {
        results.web_search.errors.push(
          `${provider.name}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // ── Phase 3: Create cron_issues for actionable findings ─────────
    const issueDescriptions: string[] = [];

    // Gemini models not found (potential deprecation)
    for (const [key, status] of Object.entries(results.gemini_api.our_models_status)) {
      if (status === 'not_found') {
        issueDescriptions.push(
          `Gemini model ${key} (${(AI_MODELS as Record<string, string>)[key]}) not found in models.list API - may be deprecated or renamed`
        );
      }
    }

    // Newer Gemini versions available
    if (results.gemini_api.newer_versions.length > 0) {
      issueDescriptions.push(
        `Newer Gemini models available: ${results.gemini_api.newer_versions.join(', ')}`
      );
    }

    // Web search findings
    for (const finding of results.web_search.findings) {
      issueDescriptions.push(
        `[${finding.finding_type}] ${finding.model_name}: ${finding.summary}${finding.source_url ? ` (${finding.source_url})` : ''}`
      );
    }

    // Deduplicate against existing open issues
    for (const description of issueDescriptions) {
      const { data: existing } = await supabase
        .from('cron_issues')
        .select('id')
        .eq('issue_type', 'model_update_available')
        .eq('description', description)
        .in('status', ['open', 'retrying', 'needs_manual'])
        .limit(1);

      if (existing && existing.length > 0) {
        continue; // Already have this issue open
      }

      await supabase.from('cron_issues').insert({
        issue_type: 'model_update_available',
        job_name: 'check-ai-models',
        description,
        status: 'open',
        retry_count: 0,
        max_retries: 0,
        auto_fixable: false,
      });

      results.issues_created++;
    }

    console.log(
      `AI Model Check: ${results.gemini_api.models_found} Gemini models listed, ` +
      `${results.web_search.queries_run} web searches, ` +
      `${results.issues_created} issues created`
    );

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('AI model check failed:', error);
    results.errors.push(error instanceof Error ? error.message : String(error));

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        ...results,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  } finally {
    // Always log execution
    await supabase.from('cron_executions').insert({
      job_name: 'check-ai-models',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      success: results.errors.length === 0,
      articles_created: results.issues_created,
      errors: [...results.errors, ...results.gemini_api.errors, ...results.web_search.errors].length > 0
        ? [...results.errors, ...results.gemini_api.errors, ...results.web_search.errors]
        : null,
      response_data: results,
      triggered_by: request.headers.get('x-vercel-cron') === '1' ? 'vercel-cron' : 'manual',
    });
  }
}
