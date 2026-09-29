-- The voice a publisher chose for an edition's audio (src/lib/voice-options.ts,
-- /editor/[group]/voices, src/lib/edition-audio.ts).
--
-- At setup the publisher's own editors listen to samples A to E for their area
-- and pick one. The label is what they chose; provider, voice and model are
-- the option it resolved to at that moment, kept for the record. The audio
-- job resolves the label through the current catalogue, falling back to the
-- stored provider and voice if the label has been removed.
--
-- One row per edition (latest choice wins). If this table cannot be read, the
-- audio job keeps its existing voice, so the morning audio never breaks.

CREATE TABLE IF NOT EXISTS public.edition_voice_choice (
  neighborhood_id  text PRIMARY KEY,
  label            text NOT NULL CHECK (label IN ('A', 'B', 'C', 'D', 'E')),
  language         text,
  provider         text,
  voice            text,
  model            text,
  chosen_by        text NOT NULL,
  chosen_at        timestamptz NOT NULL DEFAULT now()
);

-- Grants required for Data API access (post Oct 30, 2026). Service role only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.edition_voice_choice TO service_role;

ALTER TABLE public.edition_voice_choice ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages edition_voice_choice" ON public.edition_voice_choice;
CREATE POLICY "Service role manages edition_voice_choice"
  ON public.edition_voice_choice FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
