-- Weekly Briefs ("The Sunday Edition")
-- Stores generated weekly brief content per neighborhood

CREATE TABLE IF NOT EXISTS weekly_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  neighborhood_id TEXT NOT NULL REFERENCES neighborhoods(id) ON DELETE CASCADE,
  week_date DATE NOT NULL,  -- The Sunday date this brief covers
  rearview_narrative TEXT,
  rearview_stories JSONB DEFAULT '[]',
  horizon_events JSONB DEFAULT '[]',
  data_point JSONB,
  article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_weekly_briefs_neighborhood_week
  ON weekly_briefs(neighborhood_id, week_date);
CREATE INDEX idx_weekly_briefs_week_date
  ON weekly_briefs(week_date DESC);

-- Track Sunday Edition email sends (dedup)
CREATE TABLE IF NOT EXISTS weekly_brief_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  neighborhood_id TEXT NOT NULL,
  week_date DATE NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_weekly_brief_sends_dedup
  ON weekly_brief_sends(recipient_id, week_date);

-- RLS
ALTER TABLE weekly_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_brief_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on weekly_briefs"
  ON weekly_briefs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on weekly_brief_sends"
  ON weekly_brief_sends FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view weekly_briefs"
  ON weekly_briefs FOR SELECT TO authenticated USING (true);
