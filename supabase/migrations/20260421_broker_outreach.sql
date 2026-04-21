-- Broker outreach tracking: the state machine for cold-to-paid broker funnel.
--
-- One row per (broker_email, neighborhood_id) pitched. Tracks the full lifecycle:
-- cold pitch (touch 1) -> flipped-funnel follow-up (touch 2, invites consumer
-- subscription) -> paid pitch (touch 3, only after they become a warm subscriber)
-- -> converted (they activated as paid partner).
--
-- Separate from partner_waitlist (which is "I want notification when this
-- neighborhood reopens") and from agent_partners (which is "paid broker with
-- active subscription"). This table is for prospects we've emailed cold.

CREATE TABLE IF NOT EXISTS broker_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_email TEXT NOT NULL,
  broker_name TEXT,
  brokerage_name TEXT,
  neighborhood_id TEXT NOT NULL REFERENCES neighborhoods(id) ON DELETE CASCADE,

  -- Where this lead came from. Useful for analyzing conversion by batch.
  source TEXT NOT NULL,

  -- Touch timestamps (null until that touch fires)
  touch_1_sent_at TIMESTAMPTZ,
  touch_2_sent_at TIMESTAMPTZ,
  touch_3_sent_at TIMESTAMPTZ,

  -- If and when they replied (manually recorded by Morgan, or auto via webhook)
  reply_received_at TIMESTAMPTZ,
  reply_type TEXT, -- warm | not_interested | ooo | price_objection | other

  -- State machine:
  --   pending         - touch 1 sent, waiting for first follow-up
  --   active          - touch 2 sent, waiting on subscribe or unsub
  --   subscribed      - joined consumer newsletter (warm audience)
  --   warm            - 14+ days as subscriber, ready for touch 3 (paid pitch)
  --   converted       - activated as paid partner (agent_partners.status=active)
  --   unsubscribed    - opted out, never send again
  --   bounced         - hard bounce, never send again
  --   neighborhood_taken - another broker activated for their neighborhood
  --   ooo             - out-of-office reply received (pause)
  --   not_interested  - negative reply received
  drip_status TEXT NOT NULL DEFAULT 'pending',

  subscribed_to_newsletter_at TIMESTAMPTZ,
  converted_to_partner_at TIMESTAMPTZ,

  -- Random token used in unsub URL and (same token, different label) to
  -- trace subscriber signups back to this outreach row.
  unsub_token TEXT UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per broker per neighborhood. Same broker can be targeted for
  -- multiple neighborhoods (top producers who cover adjacent areas).
  UNIQUE(broker_email, neighborhood_id)
);

CREATE INDEX IF NOT EXISTS idx_broker_outreach_active_drip
  ON broker_outreach (drip_status, touch_1_sent_at)
  WHERE drip_status IN ('pending', 'active', 'subscribed');

CREATE INDEX IF NOT EXISTS idx_broker_outreach_email
  ON broker_outreach (broker_email);

CREATE INDEX IF NOT EXISTS idx_broker_outreach_neighborhood
  ON broker_outreach (neighborhood_id);

CREATE INDEX IF NOT EXISTS idx_broker_outreach_unsub_token
  ON broker_outreach (unsub_token);

CREATE OR REPLACE FUNCTION broker_outreach_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_broker_outreach_updated_at ON broker_outreach;
CREATE TRIGGER trg_broker_outreach_updated_at
  BEFORE UPDATE ON broker_outreach
  FOR EACH ROW EXECUTE FUNCTION broker_outreach_updated_at();

ALTER TABLE broker_outreach ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'broker_outreach' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON broker_outreach
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

COMMENT ON TABLE broker_outreach IS 'Lifecycle tracking for broker cold-to-paid funnel. See scripts/send-broker-pitches.mjs (touch 1), api/cron/broker-drip (touch 2 and 3), api/broker-drip/unsub (opt-out).';
