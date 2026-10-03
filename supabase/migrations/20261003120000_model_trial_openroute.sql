-- The shadow model trial gains a third stage, 'openroute': the open-weight
-- route end to end (Serper results, our own fetcher, DeepSeek via OpenRouter).
ALTER TABLE public.model_trial_runs DROP CONSTRAINT IF EXISTS model_trial_runs_stage_check;
ALTER TABLE public.model_trial_runs
  ADD CONSTRAINT model_trial_runs_stage_check CHECK (stage IN ('writer', 'search', 'openroute'));
