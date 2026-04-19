-- Analytics events: lightweight funnel tracking for email capture surfaces
-- Queryable via SQL, no external analytics dependency.

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  event TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  anonymous_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  path TEXT,
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_created
  ON analytics_events (event, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_anon
  ON analytics_events (anonymous_id)
  WHERE anonymous_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON analytics_events (created_at DESC);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Service role only. No public policies = endpoint must use supabaseAdmin.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'analytics_events' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON analytics_events
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

COMMENT ON TABLE analytics_events IS 'Funnel events for email capture and onboarding surfaces. See src/lib/analytics.ts.';
