-- Tiered sourcing standard, measured in shadow (src/lib/source-standard.ts,
-- cron shadow-source-standard).
--
-- One row per (brief, story): the story's stakes (HIGH or LOW, classified in
-- code), which confirmed sources it has (from story_source_checks), whether
-- it meets the tiered standard, and for a HIGH story with one confirmed
-- source, whether a bounded second-source search found a second page that
-- the fact matcher confirmed. Written only by the shadow cron with the
-- service role; nothing that publishes reads it.

CREATE TABLE IF NOT EXISTS public.story_source_standard (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id              uuid NOT NULL REFERENCES public.neighborhood_briefs(id) ON DELETE CASCADE,
  neighborhood_id       text NOT NULL,
  brief_date            date NOT NULL,
  story_index           integer NOT NULL,
  story_entity          text,
  stakes                text NOT NULL CHECK (stakes IN ('high', 'low')),
  stakes_reasons        jsonb,
  confirmed_sources     jsonb,
  independent_count     integer NOT NULL DEFAULT 0,
  meets                 boolean NOT NULL,
  basis                 text,
  failure               text,
  second_tried          boolean NOT NULL DEFAULT false,
  second_found          boolean NOT NULL DEFAULT false,
  second_url            text,
  second_verdict        text,
  second_snapshot_path  text,
  meets_after_second    boolean NOT NULL,
  checked_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_source_standard_unique UNIQUE (brief_id, story_index)
);

CREATE INDEX IF NOT EXISTS story_source_standard_edition_date_idx
  ON public.story_source_standard (neighborhood_id, brief_date);

-- Grants required for Data API access (post Oct 30, 2026). Service role only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_source_standard TO service_role;

ALTER TABLE public.story_source_standard ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages story source standard" ON public.story_source_standard;
CREATE POLICY "Service role manages story source standard"
  ON public.story_source_standard FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
