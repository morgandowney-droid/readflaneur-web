-- Email postcard cache table: stores daily/sunday postcard selections
-- so all recipients in the same day get the same postcards

CREATE TABLE IF NOT EXISTS email_postcards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  send_date DATE NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('daily', 'sunday')),
  neighborhood_id TEXT NOT NULL REFERENCES neighborhoods(id),
  neighborhood_name TEXT NOT NULL,
  city_name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  teaser TEXT NOT NULL,
  article_url TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dedup: one postcard per neighborhood per day per variant
CREATE UNIQUE INDEX idx_email_postcards_dedup
  ON email_postcards (send_date, variant, neighborhood_id);

-- City recency check: quickly find which cities were used recently
CREATE INDEX idx_email_postcards_city_recency
  ON email_postcards (city_name, send_date DESC);

-- Enable RLS
ALTER TABLE email_postcards ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on email_postcards"
  ON email_postcards FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Deactivate escape_mode house ad
UPDATE house_ads SET active = false WHERE type = 'escape_mode';
