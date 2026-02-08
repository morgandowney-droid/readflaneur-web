-- Allow multiple ads to share the same Stripe session ID
-- (needed for multi-neighborhood bookings where one checkout creates N ads)
ALTER TABLE ads DROP CONSTRAINT IF EXISTS ads_stripe_session_id_key;

-- Add a non-unique index for webhook lookups by session ID
CREATE INDEX IF NOT EXISTS idx_ads_stripe_session_id ON ads (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
