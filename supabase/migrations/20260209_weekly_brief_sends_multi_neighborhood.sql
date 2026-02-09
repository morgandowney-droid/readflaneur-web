-- Allow multiple Sunday Edition sends per recipient per week (one per neighborhood)
-- Previously: unique on (recipient_id, week_date) - only one send per week
-- Now: unique on (recipient_id, neighborhood_id, week_date) - one per neighborhood per week

DROP INDEX IF EXISTS idx_weekly_brief_sends_dedup;
CREATE UNIQUE INDEX idx_weekly_brief_sends_dedup
  ON weekly_brief_sends(recipient_id, neighborhood_id, week_date);
