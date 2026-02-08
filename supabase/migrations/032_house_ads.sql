-- House Ads: Self-promotional fallback ads displayed when no paid campaigns are active.
-- Weighted random selection ensures varied but controlled distribution.

CREATE TABLE IF NOT EXISTS house_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('referral', 'waitlist', 'newsletter', 'app_download', 'advertise')),
  headline TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  click_url TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_house_ads_active ON house_ads(active) WHERE active = TRUE;
ALTER TABLE house_ads ENABLE ROW LEVEL SECURITY;

-- Public can read active house ads
CREATE POLICY "House ads are viewable by everyone"
  ON house_ads FOR SELECT USING (active = TRUE);

-- Service role manages house ads
CREATE POLICY "Service role can manage house ads"
  ON house_ads FOR ALL USING (auth.role() = 'service_role');

-- Seed data
INSERT INTO house_ads (type, headline, body, click_url, weight) VALUES
  ('waitlist', 'Know Someone Who Belongs?', 'Invite a friend to the world''s most exclusive local feed.', '/invite', 3),
  ('app_download', 'Take Flaneur With You', 'The app is coming soon. Get notified when it launches.', '/app', 2),
  ('advertise', 'Your Brand Belongs Here', 'Reach the most discerning readers in 200 neighborhoods worldwide.', '/advertise', 2),
  ('newsletter', 'The Daily Brief', 'Get hyper-local intelligence delivered every morning.', '/email/subscribe', 3);
