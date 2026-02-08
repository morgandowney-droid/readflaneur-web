-- Self-Hosted Ad Booking Engine
-- Replaces Passionfroot integration with native Stripe Checkout booking

-- 1. Add new columns to ads table
ALTER TABLE ads
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS customer_email TEXT;

-- 2. Update status constraint to support booking flow
-- Drop old constraint and add new one
ALTER TABLE ads DROP CONSTRAINT IF EXISTS ads_status_check;
ALTER TABLE ads ADD CONSTRAINT ads_status_check
  CHECK (status IN (
    -- Legacy statuses (kept for existing data)
    'pending', 'pending_review', 'approved', 'rejected', 'active', 'paused', 'expired',
    -- New booking flow statuses
    'pending_payment', 'pending_assets', 'in_review'
  ));

-- 3. Add global takeover flag
ALTER TABLE ads
  ADD COLUMN IF NOT EXISTS is_global_takeover BOOLEAN DEFAULT false;

-- 4. Double-booking prevention: unique composite index
-- Only one active booking per neighborhood + placement_type + date
-- Excludes rejected and expired pending_payment rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_booking_exclusivity
  ON ads (neighborhood_id, placement_type, start_date)
  WHERE status NOT IN ('rejected', 'pending_payment');

-- 5. Create ad-assets storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('ad-assets', 'ad-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 6. Storage policy: allow service role to upload (API handles auth)
-- Public read access
CREATE POLICY "Public read access for ad assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ad-assets');

-- Service role can insert/update/delete
CREATE POLICY "Service role full access for ad assets"
  ON storage.objects FOR ALL
  USING (bucket_id = 'ad-assets')
  WITH CHECK (bucket_id = 'ad-assets');
