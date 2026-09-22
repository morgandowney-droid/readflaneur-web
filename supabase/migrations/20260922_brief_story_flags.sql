-- Editor-first flags on each morning's brief stories (src/lib/story-flags.ts).
-- Written by the flag-brief-stories cron after enrichment; read by the private
-- editor desk (/desk/[group]). Null means not yet classified.
ALTER TABLE public.neighborhood_briefs
  ADD COLUMN IF NOT EXISTS story_flags jsonb;
