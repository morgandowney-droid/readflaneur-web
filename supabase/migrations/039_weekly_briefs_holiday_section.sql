-- Add holiday_section JSONB column to weekly_briefs
-- Stores structured holiday event data for "That Time of Year" section
ALTER TABLE weekly_briefs ADD COLUMN IF NOT EXISTS holiday_section JSONB;
