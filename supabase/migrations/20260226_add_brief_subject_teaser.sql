-- Add subject_teaser column for Morning Brew-style information gap email subject lines
-- Generated during Gemini enrichment, used by email sender for compelling subject lines
ALTER TABLE neighborhood_briefs ADD COLUMN IF NOT EXISTS subject_teaser text;
