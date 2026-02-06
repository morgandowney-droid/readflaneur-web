-- Add primary location and timezone columns to profiles
-- Allows users to set their preferred timezone for newsletters and personalization

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS primary_city TEXT,
ADD COLUMN IF NOT EXISTS primary_timezone TEXT,
ADD COLUMN IF NOT EXISTS location_prompt_dismissed_at TIMESTAMPTZ;

-- Add timezone column to newsletter_subscribers for anonymous users
ALTER TABLE newsletter_subscribers
ADD COLUMN IF NOT EXISTS timezone TEXT;

-- Comments
COMMENT ON COLUMN profiles.primary_city IS 'User-selected primary city from our supported 38 cities';
COMMENT ON COLUMN profiles.primary_timezone IS 'IANA timezone (e.g., Europe/London) for the primary city';
COMMENT ON COLUMN profiles.location_prompt_dismissed_at IS 'When user dismissed the location prompt - do not ask again for 30 days';
COMMENT ON COLUMN newsletter_subscribers.timezone IS 'Browser-detected IANA timezone for newsletter send time optimization';

-- Index for querying by timezone (useful for batch newsletter sends)
CREATE INDEX IF NOT EXISTS idx_profiles_primary_timezone ON profiles(primary_timezone) WHERE primary_timezone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_timezone ON newsletter_subscribers(timezone) WHERE timezone IS NOT NULL;
