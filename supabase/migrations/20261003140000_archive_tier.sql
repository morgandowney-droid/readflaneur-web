-- Archive tier: a shadow edition for every ~25,000-person area (data/areas/*.json),
-- written by the low-cost pipeline in src/lib/archive/. Private: nothing here is
-- read by any public page or feed.

-- What we learned about an area's own sources (council news page or feed,
-- events page), found once and reused every day.
CREATE TABLE IF NOT EXISTS public.archive_area_sources (
  area_id       text PRIMARY KEY,
  country       text NOT NULL,
  council_url   text,
  council_feed  text,
  events_url    text,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  notes         jsonb
);

-- One row per area, local date and kind ('brief' or 'look_ahead').
CREATE TABLE IF NOT EXISTS public.archive_editions (
  id          bigserial PRIMARY KEY,
  area_id     text NOT NULL,
  country     text NOT NULL,
  local_date  date NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('brief', 'look_ahead')),
  language    text NOT NULL,
  headline    text,
  body        text,
  stories     jsonb,
  sources     jsonb,
  gathered    jsonb,
  cost_usd    numeric(10, 6),
  audio_url   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT archive_editions_unique UNIQUE (area_id, local_date, kind)
);
CREATE INDEX IF NOT EXISTS archive_editions_date_idx ON public.archive_editions (local_date DESC, country);

-- Events gathered weekly; each day's Look Ahead lists the next seven days from here.
CREATE TABLE IF NOT EXISTS public.archive_events (
  id          bigserial PRIMARY KEY,
  area_id     text NOT NULL,
  event_date  date NOT NULL,
  time_text   text,
  name        text NOT NULL,
  venue       text,
  category    text,
  source_url  text,
  gathered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT archive_events_unique UNIQUE (area_id, event_date, name)
);
CREATE INDEX IF NOT EXISTS archive_events_area_date_idx ON public.archive_events (area_id, event_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.archive_area_sources TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archive_editions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archive_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.archive_editions_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.archive_events_id_seq TO service_role;

ALTER TABLE public.archive_area_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.archive_area_sources FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service role only" ON public.archive_editions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service role only" ON public.archive_events FOR ALL USING (auth.role() = 'service_role');
