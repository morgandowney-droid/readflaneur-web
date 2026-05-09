-- Campaign 2: 2-day sample warm-up + day-3 marketing pitch.
-- Tracked separately from the original drip touches so we can re-engage
-- the existing broker_outreach list without breaking the touch_1/2/3
-- state machine that broker-drip cron already operates on.
--
-- See scripts/send-campaign-2.mjs for the send logic.

ALTER TABLE broker_outreach
  ADD COLUMN IF NOT EXISTS c2_sample_1_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS c2_sample_2_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS c2_pitch_sent_at    TIMESTAMPTZ;

-- Index on each touch so the send script can find "ready to send touch N"
-- rows in O(log n) without scanning the full table.
CREATE INDEX IF NOT EXISTS idx_broker_outreach_c2_sample_1
  ON broker_outreach (c2_sample_1_sent_at)
  WHERE c2_sample_1_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_broker_outreach_c2_sample_2
  ON broker_outreach (c2_sample_2_sent_at, c2_sample_1_sent_at)
  WHERE c2_sample_2_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_broker_outreach_c2_pitch
  ON broker_outreach (c2_pitch_sent_at, c2_sample_2_sent_at)
  WHERE c2_pitch_sent_at IS NULL;
