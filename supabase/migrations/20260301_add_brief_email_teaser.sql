-- Add email_teaser column to neighborhood_briefs
-- Stores Gemini-generated information-dense 2-3 sentence teasers for email blurbs
ALTER TABLE neighborhood_briefs ADD COLUMN IF NOT EXISTS email_teaser text;
