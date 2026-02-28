-- Add brief_date column to neighborhood_briefs for database-level dedup.
-- Prevents duplicate briefs per neighborhood per day regardless of application bugs.

-- Step 1: Add nullable column (IF NOT EXISTS for idempotency if partial run)
ALTER TABLE neighborhood_briefs ADD COLUMN IF NOT EXISTS brief_date DATE;

-- Step 2: Backfill from generated_at + neighborhood timezone
-- Uses the neighborhood's IANA timezone to compute the local date at generation time.
-- Falls back to UTC for neighborhoods without a timezone.
UPDATE neighborhood_briefs nb
SET brief_date = (
  nb.generated_at AT TIME ZONE COALESCE(n.timezone, 'UTC')
)::DATE
FROM neighborhoods n
WHERE nb.neighborhood_id = n.id
  AND nb.brief_date IS NULL;

-- Catch any orphaned briefs (no matching neighborhood) with UTC fallback
UPDATE neighborhood_briefs
SET brief_date = (generated_at AT TIME ZONE 'UTC')::DATE
WHERE brief_date IS NULL;

-- Step 3: Identify the "winner" brief per (neighborhood_id, brief_date).
-- Winner = enriched first, then newest by created_at.
-- Use a temp table to hold winner IDs.
CREATE TEMP TABLE brief_winners AS
SELECT DISTINCT ON (neighborhood_id, brief_date) id AS winner_id, neighborhood_id, brief_date
FROM neighborhood_briefs
ORDER BY neighborhood_id, brief_date,
  (enriched_content IS NOT NULL) DESC,
  created_at DESC;

-- Step 4: Reassign article FK references from loser briefs to winner briefs.
-- This makes it safe to delete losers even when they have article references.
UPDATE articles a
SET brief_id = w.winner_id
FROM neighborhood_briefs nb
JOIN brief_winners w ON w.neighborhood_id = nb.neighborhood_id AND w.brief_date = nb.brief_date
WHERE a.brief_id = nb.id
  AND nb.id != w.winner_id;

-- Step 5: Delete all loser briefs (now safe - no FK refs point to them)
DELETE FROM neighborhood_briefs
WHERE id NOT IN (SELECT winner_id FROM brief_winners);

DROP TABLE brief_winners;

-- Step 6: Set NOT NULL
ALTER TABLE neighborhood_briefs ALTER COLUMN brief_date SET NOT NULL;

-- Step 7: Add unique constraint - absolute guarantee of one brief per neighborhood per day
ALTER TABLE neighborhood_briefs
  ADD CONSTRAINT uq_neighborhood_brief_date UNIQUE (neighborhood_id, brief_date);

-- Step 8: Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_neighborhood_briefs_brief_date
  ON neighborhood_briefs (brief_date);
