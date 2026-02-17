-- Add primary_neighborhood_id to profiles for exact primary neighborhood tracking.
-- Previously only stored primary_city which was ambiguous when users have multiple
-- neighborhoods in the same city.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primary_neighborhood_id TEXT REFERENCES neighborhoods(id);

-- Backfill: set primary_neighborhood_id for users who have a primary_city set
-- by finding the first matching neighborhood in their preferences
UPDATE profiles p
SET primary_neighborhood_id = (
  SELECT n.id
  FROM user_neighborhood_preferences unp
  JOIN neighborhoods n ON n.id = unp.neighborhood_id
  WHERE unp.user_id = p.id
    AND LOWER(n.city) = LOWER(p.primary_city)
  ORDER BY unp.created_at ASC
  LIMIT 1
)
WHERE p.primary_city IS NOT NULL
  AND p.primary_neighborhood_id IS NULL;
