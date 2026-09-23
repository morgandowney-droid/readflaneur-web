-- Shadow source checks (src/lib/source-check.ts, cron shadow-source-checks).
--
-- One row per (brief, story, source URL): did the page the story cites say
-- what the story says, checked in code with no model call, and where the
-- archived copy of that page is. Written only by the shadow cron with the
-- service role; nothing that publishes reads it.
--
-- source_url is '' (not NULL) for a story with no URL, so the unique key also
-- dedups no_source rows.

CREATE TABLE IF NOT EXISTS public.story_source_checks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id            uuid NOT NULL REFERENCES public.neighborhood_briefs(id) ON DELETE CASCADE,
  neighborhood_id     text NOT NULL,
  brief_date          date NOT NULL,
  story_index         integer NOT NULL,
  story_entity        text,
  source_name         text,
  source_url          text NOT NULL DEFAULT '',
  -- tool | name-match | story-match | model | unknown (briefs enriched before origins were recorded)
  source_origin       text,
  verdict             text NOT NULL CHECK (verdict IN ('verified', 'partial', 'not_found', 'fetch_failed', 'no_source', 'unverifiable_origin')),
  facts_total         integer NOT NULL DEFAULT 0,
  facts_found         integer NOT NULL DEFAULT 0,
  matched_facts       jsonb,
  missing_facts       jsonb,
  http_status         integer,
  fetch_error         text,
  final_url           text,
  snapshot_html_path  text,
  snapshot_text_path  text,
  content_hash        text,
  fetched_at          timestamptz,
  checked_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_source_checks_unique UNIQUE (brief_id, story_index, source_url)
);

CREATE INDEX IF NOT EXISTS story_source_checks_edition_date_idx
  ON public.story_source_checks (neighborhood_id, brief_date);
CREATE INDEX IF NOT EXISTS story_source_checks_verdict_idx
  ON public.story_source_checks (verdict, checked_at DESC);

-- Grants required for Data API access (post Oct 30, 2026). Service role only:
-- no anonymous or authenticated access.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_source_checks TO service_role;

ALTER TABLE public.story_source_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages story source checks" ON public.story_source_checks;
CREATE POLICY "Service role manages story source checks"
  ON public.story_source_checks FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Archive of every source page the check read: raw HTML (or an X post's
-- public JSON record) and the extracted text, at
-- <neighborhood_id>/<brief_date>/<sha1(url)>.html|.txt. Private; the service
-- role bypasses storage RLS, so no policies are granted to anyone else.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('source-snapshots', 'source-snapshots', false, 5242880)
ON CONFLICT (id) DO NOTHING;
