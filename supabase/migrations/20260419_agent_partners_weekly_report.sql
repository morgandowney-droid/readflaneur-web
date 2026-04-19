-- Track when each agent partner last received their weekly performance report
-- so the cron is idempotent and never sends two reports in the same week.

ALTER TABLE agent_partners
  ADD COLUMN IF NOT EXISTS last_report_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN agent_partners.last_report_sent_at IS
  'Timestamp of the most recent weekly report email. Used by send-weekly-broker-report cron for dedup.';
