-- Daily Brief Email Sends tracking table
-- Tracks every daily brief email sent for deduplication and analytics

CREATE TABLE IF NOT EXISTS daily_brief_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id TEXT NOT NULL,
  recipient_source TEXT NOT NULL CHECK (recipient_source IN ('profile', 'newsletter')),
  email TEXT NOT NULL,
  timezone TEXT,
  primary_neighborhood_id TEXT,
  neighborhood_count INTEGER DEFAULT 0,
  story_count INTEGER DEFAULT 0,
  had_header_ad BOOLEAN DEFAULT FALSE,
  had_native_ad BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  send_date DATE DEFAULT CURRENT_DATE
);

-- Unique index: one email per recipient per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_brief_sends_dedup
  ON daily_brief_sends(recipient_id, send_date);

-- Index for querying by date
CREATE INDEX IF NOT EXISTS idx_daily_brief_sends_date
  ON daily_brief_sends(send_date);

-- Enable RLS
ALTER TABLE daily_brief_sends ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by cron job)
CREATE POLICY "Service role full access on daily_brief_sends"
  ON daily_brief_sends FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add unsubscribe tokens and daily_email_enabled to newsletter_subscribers
ALTER TABLE newsletter_subscribers
ADD COLUMN IF NOT EXISTS unsubscribe_token UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS daily_email_enabled BOOLEAN DEFAULT TRUE;

-- Add unsubscribe token and daily_email_enabled to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS email_unsubscribe_token UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS daily_email_enabled BOOLEAN DEFAULT TRUE;

-- Backfill existing rows that may have NULL tokens
UPDATE newsletter_subscribers
SET unsubscribe_token = gen_random_uuid()
WHERE unsubscribe_token IS NULL;

UPDATE profiles
SET email_unsubscribe_token = gen_random_uuid()
WHERE email_unsubscribe_token IS NULL;

-- Index for unsubscribe token lookups
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_unsub_token
  ON newsletter_subscribers(unsubscribe_token);

CREATE INDEX IF NOT EXISTS idx_profiles_unsub_token
  ON profiles(email_unsubscribe_token);

-- Comments
COMMENT ON TABLE daily_brief_sends IS 'Tracks every daily brief email sent for deduplication and analytics';
COMMENT ON COLUMN newsletter_subscribers.unsubscribe_token IS 'Unique token for one-click email unsubscribe';
COMMENT ON COLUMN newsletter_subscribers.daily_email_enabled IS 'Whether subscriber receives the daily brief email';
COMMENT ON COLUMN profiles.email_unsubscribe_token IS 'Unique token for one-click email unsubscribe';
COMMENT ON COLUMN profiles.daily_email_enabled IS 'Whether user receives the daily brief email';
