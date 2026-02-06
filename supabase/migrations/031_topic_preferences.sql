-- Add paused_topics column to both subscriber tables
ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS paused_topics TEXT[] DEFAULT '{}';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS paused_topics TEXT[] DEFAULT '{}';

-- Topic suggestions table
CREATE TABLE IF NOT EXISTS topic_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  suggestion TEXT NOT NULL,
  source TEXT DEFAULT 'preferences',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE topic_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON topic_suggestions
  FOR ALL USING (auth.role() = 'service_role');
