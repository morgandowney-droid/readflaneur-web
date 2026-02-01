-- Activate all neighborhoods for news aggregation
-- Previously, international neighborhoods were set to is_active = false

UPDATE neighborhoods
SET is_active = true,
    is_coming_soon = false
WHERE is_active = false;

-- Log the change
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Activated % neighborhoods', updated_count;
END $$;
