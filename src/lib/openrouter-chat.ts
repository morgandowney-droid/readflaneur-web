/**
 * One chat completion through OpenRouter, recorded in ai_usage_events.
 *
 * Used by the shadow trial of the open-weight route (open-search.ts and the
 * `openrouter:` model prefix in brief-enricher-gemini.ts). Throws on failure,
 * so a caller can tell an empty answer from a failed call.
 */
import { recordAiUsage, type AiProvider } from '@/lib/ai-cost';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface OpenRouterResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** What OpenRouter billed, when it says. */
  costUsd: number | null;
  /** 'stop', 'length' (ran out of max_tokens), ... */
  finishReason: string | null;
  /** Tokens the model spent thinking before answering, when reported. */
  reasoningTokens: number | null;
}

function providerFor(model: string): AiProvider {
  if (model.startsWith('deepseek/')) return 'deepseek';
  if (model.startsWith('qwen/')) return 'qwen';
  if (model.startsWith('meta-llama/')) return 'meta';
  return 'openrouter';
}

export async function openRouterChat(opts: {
  model: string;
  prompt: string;
  operation: string;
  label?: string | null;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  timeoutMs?: number;
  /** Cap how long a thinking model thinks before it answers. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /**
   * Providers to try in order, and a ceiling in USD per million tokens. OpenRouter's
   * own "sort by price" sorts on input price only, which picked a provider charging
   * 23 times more for output; name the providers and cap the price instead.
   */
  providers?: { order?: string[]; maxPrice?: { prompt: number; completion: number } };
}): Promise<OpenRouterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 3000));
    let res: Response;
    try {
      res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://readflaneur.com',
          'X-Title': 'Flaneur',
        },
        body: JSON.stringify({
          model: opts.model,
          messages: [{ role: 'user', content: opts.prompt }],
          temperature: opts.temperature ?? 0.4,
          max_tokens: opts.maxTokens ?? 4000,
          usage: { include: true },
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
          ...(opts.reasoningEffort ? { reasoning: { effort: opts.reasoningEffort } } : {}),
          ...(opts.providers ? { provider: {
            ...(opts.providers.order ? { order: opts.providers.order, allow_fallbacks: true } : {}),
            ...(opts.providers.maxPrice ? { max_price: opts.providers.maxPrice } : {}),
          } } : {}),
        }),
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }
    if (res.status === 429 || res.status >= 500) { lastError = `OpenRouter HTTP ${res.status}`; continue; }
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json();
    if (data?.error) throw new Error(`OpenRouter: ${JSON.stringify(data.error).slice(0, 200)}`);
    const usage = data?.usage || {};
    const result: OpenRouterResult = {
      text: data?.choices?.[0]?.message?.content || '',
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      costUsd: typeof usage.cost === 'number' ? usage.cost : null,
      finishReason: data?.choices?.[0]?.finish_reason ?? null,
      reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
    };
    recordAiUsage({
      provider: providerFor(opts.model),
      model: opts.model,
      operation: opts.operation,
      kind: 'generation',
      label: opts.label || null,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      metadata: { via: 'openrouter' },
      providerCostUsd: result.costUsd,
    });
    return result;
  }
  throw new Error(lastError || 'OpenRouter failed');
}
