-- Llama judge for Facebook, Instagram, Threads and TikTok sources
-- (src/lib/social-judge.ts, run by the shadow-source-checks cron).
--
-- Runs after 20260923090000_story_source_checks.sql. The deterministic
-- verdict stays in `verdict`; a social post's model verdict is recorded next
-- to it, with `judge` naming who judged. Existing grants and RLS on the table
-- cover the new columns.

ALTER TABLE public.story_source_checks
  ADD COLUMN IF NOT EXISTS judge text,                       -- 'llama'
  ADD COLUMN IF NOT EXISTS judge_model text,                 -- e.g. meta-llama/llama-4-maverick
  ADD COLUMN IF NOT EXISTS judge_platform text,              -- facebook | instagram | threads | tiktok
  ADD COLUMN IF NOT EXISTS judge_verdict text
    CHECK (judge_verdict IS NULL OR judge_verdict IN ('supports', 'contradicts', 'unrelated', 'unreadable')),
  ADD COLUMN IF NOT EXISTS judge_supported_facts jsonb,
  ADD COLUMN IF NOT EXISTS judge_contradicted_facts jsonb,
  ADD COLUMN IF NOT EXISTS judge_reason text,
  ADD COLUMN IF NOT EXISTS judged_at timestamptz;

CREATE INDEX IF NOT EXISTS story_source_checks_judge_idx
  ON public.story_source_checks (judge, judge_verdict)
  WHERE judge IS NOT NULL;
