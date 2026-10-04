-- Quality control for the archive tier (src/lib/archive/quality.ts): a nightly
-- scorecard per country and a daily side-by-side for places production also
-- covers. Private; read by /archive-quality behind a key.
CREATE TABLE IF NOT EXISTS public.archive_quality (
  id          bigserial PRIMARY KEY,
  check_date  date NOT NULL,
  scope       text NOT NULL CHECK (scope IN ('scorecard', 'pair')),
  key         text NOT NULL,
  metrics     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT archive_quality_unique UNIQUE (check_date, scope, key)
);
CREATE INDEX IF NOT EXISTS archive_quality_date_idx ON public.archive_quality (check_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archive_quality TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.archive_quality_id_seq TO service_role;
ALTER TABLE public.archive_quality ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.archive_quality FOR ALL USING (auth.role() = 'service_role');
