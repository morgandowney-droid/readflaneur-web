/**
 * A scoped tap on AI usage recording, for shadow trials.
 *
 * Code run inside `withUsageTap()` records its AI calls exactly as it always
 * does (recordGeminiCall / recordGrokCall), but ai-cost.ts sees the tap and
 * (a) files the row under the tap's operation, keeping the original operation
 * in metadata, and (b) hands the call to the tap so the trial can total its
 * own cost. Nothing outside the scope is affected: AsyncLocalStorage keeps the
 * tap on this async chain only, so production crons running in the same
 * process at the same time are untouched.
 *
 * `suppressWrite` skips the ai_usage_events insert, for local dry runs that
 * must not write to the database.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TappedCall {
  provider: string;
  model: string;
  /** The operation the call site recorded (enrich_daily_brief, source_repair, ...). */
  operation: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** Our token-price estimate (ai-cost.ts), the same figure ai_usage_events stores. */
  estimatedCostUsd: number;
  /** The provider's own billed figure when the response carries one (xAI cost_in_usd_ticks). */
  providerCostUsd?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface UsageTap {
  operation: string;
  calls: TappedCall[];
  suppressWrite?: boolean;
}

const storage = new AsyncLocalStorage<UsageTap>();

export function withUsageTap<T>(tap: UsageTap, fn: () => Promise<T>): Promise<T> {
  return storage.run(tap, fn);
}

export function currentUsageTap(): UsageTap | undefined {
  return storage.getStore();
}

/** Total cost of the tapped calls: the provider's figure where known, else our estimate. */
export function tapCostUsd(calls: TappedCall[]): number {
  return calls.reduce((n, c) => n + (typeof c.providerCostUsd === 'number' ? c.providerCostUsd : c.estimatedCostUsd), 0);
}
