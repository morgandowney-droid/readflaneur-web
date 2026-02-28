-- Add brief_date column to neighborhood_briefs for database-level dedup.
-- Prevents duplicate briefs per neighborhood per day regardless of application bugs.

-- Step 1: Add nullable column
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

-- Step 3: Remove duplicates BEFORE adding unique constraint.
-- Keep the best brief per (neighborhood_id, brief_date):
--   1. Prefer enriched (enriched_content IS NOT NULL)
--   2. Then newest (created_at DESC)
-- But never delete a brief that has articles referencing it (FK safety).
DELETE FROM neighborhood_briefs
WHERE id IN (
  SELECT nb.id
  FROM neighborhood_briefs nb
  LEFT JOIN articles a ON a.brief_id = nb.id
  WHERE a.brief_id IS NULL  -- no article references this brief
    AND nb.id NOT IN (
      -- Keep the "best" brief per neighborhood per date
      SELECT DISTINCT ON (neighborhood_id, brief_date) id
      FROM neighborhood_briefs
      ORDER BY neighborhood_id, brief_date,
        (enriched_content IS NOT NULL) DESC,
        created_at DESC
    )
);

-- Step 4: For remaining duplicates that have article references,
-- keep the one with the most recent article reference and delete others
-- (only if there are still duplicates after Step 3)
DELETE FROM neighborhood_briefs
WHERE id IN (
  SELECT nb.id
  FROM neighborhood_briefs nb
  WHERE EXISTS (
    SELECT 1 FROM neighborhood_briefs nb2
    WHERE nb2.neighborhood_id = nb.neighborhood_id
      AND nb2.brief_date = nb.brief_date
      AND nb2.id != nb.id
      AND nb2.created_at > nb.created_at
  )
  AND NOT EXISTS (
    SELECT 1 FROM articles a WHERE a.brief_id = nb.id
  )
);

-- Step 5: Set NOT NULL
ALTER TABLE neighborhood_briefs ALTER COLUMN brief_date SET NOT NULL;

-- Step 6: Add unique constraint - absolute guarantee of one brief per neighborhood per day
ALTER TABLE neighborhood_briefs
  ADD CONSTRAINT uq_neighborhood_brief_date UNIQUE (neighborhood_id, brief_date);

-- Step 7: Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_neighborhood_briefs_brief_date
  ON neighborhood_briefs (brief_date);
