-- Partner waitlist: captures broker interest in a neighborhood when it's already
-- taken so we can auto-notify them if the existing partner cancels.
--
-- Two sources feed the waitlist:
--   'setup_blocked' - broker hit the "This neighborhood is taken" screen
--   'cold_pitch'    - we sent them a cold outreach email about this neighborhood
-- Both get notified by customer.subscription.deleted webhook when the slot reopens.

CREATE TABLE IF NOT EXISTS partner_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  neighborhood_id TEXT NOT NULL REFERENCES neighborhoods(id) ON DELETE CASCADE,
  broker_email TEXT NOT NULL,
  broker_name TEXT,
  brokerage_name TEXT,
  source TEXT NOT NULL DEFAULT 'setup_blocked',
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(neighborhood_id, broker_email)
);

CREATE INDEX IF NOT EXISTS idx_partner_waitlist_active
  ON partner_waitlist (neighborhood_id)
  WHERE notified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_partner_waitlist_email
  ON partner_waitlist (broker_email);

ALTER TABLE partner_waitlist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'partner_waitlist' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON partner_waitlist
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

COMMENT ON TABLE partner_waitlist IS 'Broker interest queue for taken neighborhoods. See /api/partner/check-neighborhood and customer.subscription.deleted webhook handler.';
