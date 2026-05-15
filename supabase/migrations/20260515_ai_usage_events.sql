-- Per-call AI usage + cost instrumentation.
-- One row per external AI API call (Gemini / Grok / Claude), written
-- fire-and-forget by src/lib/ai-cost.ts recordAiUsage(). Lets us measure the
-- real search-vs-generation cost split per pipeline before deciding what to
-- migrate to cheaper open-weight models.

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider TEXT NOT NULL,                       -- 'gemini' | 'grok' | 'claude' | 'openai'
  model TEXT NOT NULL,
  operation TEXT NOT NULL,                      -- 'neighborhood_brief', 'enrich_daily_brief', 'translate_article', ...
  kind TEXT NOT NULL,                           -- 'search' | 'generation'
  label TEXT,                                   -- free-form: neighborhood name, language code
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,     -- includes Gemini thinking tokens (billed as output)
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER,                         -- citations / live-search sources (Grok cost proxy)
  estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_created_at ON public.ai_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_operation ON public.ai_usage_events (operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_provider ON public.ai_usage_events (provider, created_at DESC);

-- Data API grants (required for new tables created after the Oct 30 2026 cutover).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_usage_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ai_usage_events_id_seq TO service_role;

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access ai_usage_events" ON public.ai_usage_events;
CREATE POLICY "service_role full access ai_usage_events"
  ON public.ai_usage_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
