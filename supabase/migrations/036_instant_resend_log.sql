-- Instant resend rate limit tracking
-- Tracks how many times a user triggers an instant email resend per day (max 3)

CREATE TABLE IF NOT EXISTS instant_resend_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id TEXT NOT NULL,
  recipient_source TEXT NOT NULL CHECK (recipient_source IN ('profile', 'newsletter')),
  trigger TEXT NOT NULL,
  send_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_instant_resend_log_rate_limit
  ON instant_resend_log(recipient_id, send_date);

ALTER TABLE instant_resend_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on instant_resend_log"
  ON instant_resend_log FOR ALL USING (true) WITH CHECK (true);
