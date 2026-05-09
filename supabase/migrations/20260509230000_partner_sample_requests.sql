-- Lead-capture log for the "see a sample of your neighborhood newsletter" form
-- on the /partner page. One row per sample-send. Used for two things:
--
-- 1. Rate limiting. We check per-IP (3/hr) and per-email (1/24h) before sending
--    so an attacker can't bomb a victim's inbox with branded samples or spike
--    our Resend bill.
-- 2. Lead source telemetry. The partner_waitlist row gets source='sample_request'
--    but waitlist is upsert-only on (neighborhood_id, broker_email), so this
--    table preserves the full request history for any analytics later.

CREATE TABLE IF NOT EXISTS partner_sample_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_email TEXT NOT NULL,
  neighborhood_id TEXT NOT NULL REFERENCES neighborhoods(id) ON DELETE CASCADE,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_sample_requests_email_created
  ON partner_sample_requests (broker_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_sample_requests_ip_created
  ON partner_sample_requests (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

ALTER TABLE partner_sample_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'partner_sample_requests' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON partner_sample_requests
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

COMMENT ON TABLE partner_sample_requests IS 'One row per /partner sample-request submission. Used for rate limiting and lead telemetry. See /api/partner/sample-request.';
