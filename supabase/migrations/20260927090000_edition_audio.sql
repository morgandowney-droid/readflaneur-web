-- Daily audio edition (src/lib/edition-audio.ts, cron generate-edition-audio).
--
-- One short spoken edition per edition and local date, written by Gemini Flash
-- from that morning's published Daily Brief and Look Ahead (no search, the
-- edition is the only source) and voiced by Azure Speech with a standard
-- neural voice for the language. First used for GEDI's four quartieri in
-- Italian.
--
-- The MP3 lives in the public `edition-audio` bucket at
-- <edition>/<local date>.mp3. Public read: the audio is spoken from pages that
-- are already public, and the paths are shown only on the editor desk, the
-- GEDI morning email and the licensee feed.
--
-- item_keys holds the editorial_decisions story_key of every story and event
-- the script used, so the licensee feed can serve the audio to a licensee
-- that requires approval only once every one of those items is approved and
-- unedited.

CREATE TABLE IF NOT EXISTS public.edition_audio (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  neighborhood_id           text NOT NULL,
  audio_date                date NOT NULL,
  language                  text NOT NULL,
  voice                     text NOT NULL,
  script                    text NOT NULL,
  storage_path              text NOT NULL,
  audio_url                 text NOT NULL,
  duration_s                numeric(6,1),
  bytes                     integer,
  brief_article_id          uuid,
  look_ahead_article_id     uuid,
  item_keys                 text[] NOT NULL DEFAULT '{}',
  tts_characters            integer,
  cost_usd                  numeric(10,6),
  model                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT edition_audio_unique UNIQUE (neighborhood_id, audio_date, language)
);

CREATE INDEX IF NOT EXISTS edition_audio_date_idx ON public.edition_audio (audio_date DESC);

-- Grants required for Data API access (post Oct 30, 2026). Service role only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.edition_audio TO service_role;

ALTER TABLE public.edition_audio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages edition_audio" ON public.edition_audio;
CREATE POLICY "Service role manages edition_audio"
  ON public.edition_audio FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Storage bucket for the MP3s. Public read; writes by the service role only
-- (the service role bypasses storage RLS, so no insert policy is needed).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('edition-audio', 'edition-audio', true, 10485760, ARRAY['audio/mpeg'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access for edition-audio" ON storage.objects;
CREATE POLICY "Public read access for edition-audio"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'edition-audio');
