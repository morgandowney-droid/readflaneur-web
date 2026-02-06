-- Add neighborhood_id column to cron_issues for brief monitoring
-- neighborhoods.id is TEXT, not UUID
ALTER TABLE cron_issues
ADD COLUMN IF NOT EXISTS neighborhood_id TEXT REFERENCES neighborhoods(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_cron_issues_neighborhood_id ON cron_issues(neighborhood_id);

-- Add comment
COMMENT ON COLUMN cron_issues.neighborhood_id IS 'Reference to neighborhood for missing_brief issues';
