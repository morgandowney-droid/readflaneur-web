/**
 * AI cost instrumentation.
 *
 * `recordAiUsage()` is fire-and-forget: it never throws and never blocks the
 * caller. It writes one row to `ai_usage_events` per external AI API call so we
 * can measure the real search-vs-generation cost split per pipeline.
 *
 * Cost accuracy notes:
 * - Gemini and Claude are token-billed, so estimateCost() is accurate for them.
 * - Grok's cost is mostly live-search fees, NOT tokens. The token estimate is a
 *   floor; GROK_SEARCH_SURCHARGE_USD adds an empirical per-call search fee
 *   derived from the xAI console (~$0.05/call). The reliable signal for Grok is
 *   the call COUNT per operation - recalibrate the surcharge anytime by dividing
 *   the xAI console's Grok total by COUNT(*) of grok rows in ai_usage_events.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type AiProvider = 'gemini' | 'grok' | 'claude' | 'openai' | 'qwen';
export type AiKind = 'search' | 'generation';

interface ModelPrice {
  inputPerM: number;
  outputPerM: number;
  cachedInputPerM: number;
}

// USD per 1M tokens. Keyed by model-ID prefix (date suffixes are stripped).
// Update when providers change pricing.
const MODEL_PRICING: Record<string, ModelPrice> = {
  'gemini-2.5-pro': { inputPerM: 1.25, outputPerM: 10.0, cachedInputPerM: 0.31 },
  'gemini-2.5-flash': { inputPerM: 0.3, outputPerM: 2.5, cachedInputPerM: 0.075 },
  'gemini-2.0-flash': { inputPerM: 0.1, outputPerM: 0.4, cachedInputPerM: 0.025 },
  'grok-4-1-fast': { inputPerM: 0.2, outputPerM: 0.5, cachedInputPerM: 0.05 },
  'claude-sonnet-4-5': { inputPerM: 3.0, outputPerM: 15.0, cachedInputPerM: 0.3 },
  // Qwen via OpenRouter (translation). Approximate - matches any 'qwen/...' model.
  qwen: { inputPerM: 0.4, outputPerM: 0.4, cachedInputPerM: 0.4 },
};

// Empirical per-call live-search fee for Grok (xAI console total / call count).
// Token cost alone undercounts a Grok call by ~40x; this is the dominant term.
// Recalibrated 2026-05-22 after dropping web_search from brief/Look Ahead/news
// (commit c85fbd5): actuals from xAI console showed ~$9/day ÷ ~300 calls/day
// = $0.03/call. Previous value $0.05 was the pre-removal calibration.
const GROK_SEARCH_SURCHARGE_USD = 0.03;

function priceFor(model: string): ModelPrice {
  const key = Object.keys(MODEL_PRICING).find((k) => model.startsWith(k));
  return key ? MODEL_PRICING[key] : { inputPerM: 0, outputPerM: 0, cachedInputPerM: 0 };
}

export function estimateCost(opts: {
  provider: AiProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}): number {
  const p = priceFor(opts.model);
  const cached = opts.cachedTokens || 0;
  const billableInput = Math.max(0, opts.inputTokens - cached);
  let cost =
    (billableInput / 1e6) * p.inputPerM +
    (cached / 1e6) * p.cachedInputPerM +
    (opts.outputTokens / 1e6) * p.outputPerM;
  if (opts.provider === 'grok') cost += GROK_SEARCH_SURCHARGE_USD;
  return cost;
}

export interface AiUsageEvent {
  provider: AiProvider;
  model: string;
  operation: string;
  kind: AiKind;
  label?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  sourceCount?: number | null;
  metadata?: Record<string, unknown> | null;
}

let cachedClient: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

/**
 * Fire-and-forget. Records one AI call to `ai_usage_events`. Never throws and
 * never blocks - safe to call from any cron or library without try/catch.
 */
export function recordAiUsage(event: AiUsageEvent): void {
  try {
    const client = getClient();
    if (!client) return;

    const inputTokens = event.inputTokens || 0;
    const outputTokens = event.outputTokens || 0;
    const cachedTokens = event.cachedTokens || 0;
    const cost = estimateCost({
      provider: event.provider,
      model: event.model,
      inputTokens,
      outputTokens,
      cachedTokens,
    });

    void client
      .from('ai_usage_events')
      .insert({
        provider: event.provider,
        model: event.model,
        operation: event.operation,
        kind: event.kind,
        label: event.label ?? null,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cached_tokens: cachedTokens,
        source_count: event.sourceCount ?? null,
        estimated_cost_usd: Number(cost.toFixed(6)),
        metadata: event.metadata ?? null,
      })
      .then(null, (err: unknown) => {
        console.warn('[ai-cost] insert failed:', err instanceof Error ? err.message : err);
      });
  } catch (err) {
    console.warn('[ai-cost] recordAiUsage error:', err instanceof Error ? err.message : err);
  }
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

/**
 * Record a Gemini `generateContent` call from its response's usageMetadata.
 * Thinking tokens (`thoughtsTokenCount`) are billed as output, so they are
 * folded into output_tokens and also surfaced in metadata for visibility.
 */
export function recordGeminiCall(
  response: { usageMetadata?: GeminiUsageMetadata } | null | undefined,
  opts: { operation: string; kind: AiKind; model: string; label?: string | null },
): void {
  const u = response?.usageMetadata;
  if (!u) return;
  const thoughts = u.thoughtsTokenCount || 0;
  recordAiUsage({
    provider: 'gemini',
    model: opts.model,
    operation: opts.operation,
    kind: opts.kind,
    label: opts.label,
    inputTokens: u.promptTokenCount || 0,
    outputTokens: (u.candidatesTokenCount || 0) + thoughts,
    cachedTokens: u.cachedContentTokenCount || 0,
    metadata: thoughts > 0 ? { thoughtsTokens: thoughts } : null,
  });
}

interface ClaudeUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * Record an Anthropic `messages.create` call from its response's `usage`.
 * Cached reads are billed at the cached rate; cache_creation_input_tokens
 * count as regular input. Parameter typed permissively so it accepts the
 * Anthropic SDK `Message` type without explicit casts at call sites.
 */
export function recordClaudeCall(
  response: { usage?: ClaudeUsage | null } | null | undefined,
  opts: { operation: string; kind: AiKind; model: string; label?: string | null },
): void {
  const u = response?.usage;
  if (!u) return;
  recordAiUsage({
    provider: 'claude',
    model: opts.model,
    operation: opts.operation,
    kind: opts.kind,
    label: opts.label,
    inputTokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0),
    outputTokens: u.output_tokens || 0,
    cachedTokens: u.cache_read_input_tokens || 0,
  });
}

interface GrokResponseData {
  usage?: { input_tokens?: number; output_tokens?: number; num_sources_used?: number };
  citations?: unknown[];
}

/**
 * Record a Grok Responses API call from its parsed `data`. Always records the
 * call even when token usage is absent - for Grok the call count is the signal
 * (search fees dominate). Tagged kind='search' since every Grok call here uses
 * web_search / x_search tools.
 */
export function recordGrokCall(
  data: GrokResponseData | null | undefined,
  opts: { operation: string; label?: string | null; model?: string },
): void {
  const u = data?.usage;
  const sourceCount =
    u?.num_sources_used ??
    (Array.isArray(data?.citations) ? data!.citations!.length : null);
  recordAiUsage({
    provider: 'grok',
    model: opts.model || 'grok-4-1-fast',
    operation: opts.operation,
    kind: 'search',
    label: opts.label,
    inputTokens: u?.input_tokens || 0,
    outputTokens: u?.output_tokens || 0,
    sourceCount,
  });
}
