-- Add enrichment tracking columns to articles table
-- Used by enrich-briefs cron to track which RSS articles have been through Gemini enrichment

ALTER TABLE articles
ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS enrichment_model TEXT;
