-- Shadow model trial (src/lib/model-trial.ts, cron shadow-model-trial).
--
-- One row per (brief date, edition, stage, candidate model): the candidate's
-- output and metrics next to production's metrics for the same inputs.
-- stage 'writer' replays the stored gathered facts through a candidate
-- enrichment model; stage 'search' runs the Grok brief search on a candidate
-- with a same-time control run of production's model as the baseline.
-- Written only by the shadow cron with the service role; nothing that
-- publishes reads it.

CREATE TABLE IF NOT EXISTS public.model_trial_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date          date NOT NULL,
  neighborhood_id   text NOT NULL,
  stage             text NOT NULL CHECK (stage IN ('writer', 'search')),
  model             text NOT NULL,
  baseline_model    text,
  output            jsonb,
  metrics           jsonb,
  baseline_metrics  jsonb,
  cost_usd          numeric(10, 6),
  latency_ms        integer,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_trial_runs_unique UNIQUE (run_date, neighborhood_id, stage, model)
);

CREATE INDEX IF NOT EXISTS model_trial_runs_stage_date_idx
  ON public.model_trial_runs (stage, model, run_date DESC);
CREATE INDEX IF NOT EXISTS model_trial_runs_created_idx
  ON public.model_trial_runs (created_at DESC);

-- Grants required for Data API access (post Oct 30, 2026). Service role only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_trial_runs TO service_role;

ALTER TABLE public.model_trial_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages model trial runs" ON public.model_trial_runs;
CREATE POLICY "Service role manages model trial runs"
  ON public.model_trial_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
