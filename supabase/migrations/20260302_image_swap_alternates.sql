-- Add alternate photos pool and rejected photo tracking to image_library_status
-- Enables auto-swap of negatively-scored Unsplash photos

-- Overflow photo pool (positions 8+ from Unsplash search results)
ALTER TABLE image_library_status
ADD COLUMN IF NOT EXISTS unsplash_alternates JSONB DEFAULT '[]';

-- Blacklisted photo IDs that should never be used again
ALTER TABLE image_library_status
ADD COLUMN IF NOT EXISTS rejected_image_ids TEXT[] DEFAULT '{}';

-- Index for efficient score aggregation on image_feedback
CREATE INDEX IF NOT EXISTS idx_image_feedback_image_url
ON image_feedback (image_url);

-- RPC to find Unsplash images with net negative scores
CREATE OR REPLACE FUNCTION get_negative_images(threshold INT DEFAULT -2)
RETURNS TABLE (image_url TEXT, score BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.image_url,
    SUM(f.feedback)::BIGINT AS score
  FROM image_feedback f
  WHERE f.image_url LIKE '%unsplash.com%'
  GROUP BY f.image_url
  HAVING SUM(f.feedback) <= threshold;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
