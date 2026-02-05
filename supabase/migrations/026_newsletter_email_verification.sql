-- Add email verification columns to newsletter_subscribers
-- This ensures subscribers have verified their email before receiving newsletters
-- Reduces robot/spam signups

ALTER TABLE newsletter_subscribers
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Create index for querying verified subscribers
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_verified
  ON newsletter_subscribers(email_verified)
  WHERE email_verified = TRUE;

-- Comment on columns
COMMENT ON COLUMN newsletter_subscribers.email_verified IS 'Whether the subscriber has verified their email via magic link';
COMMENT ON COLUMN newsletter_subscribers.verified_at IS 'Timestamp when the email was verified';
