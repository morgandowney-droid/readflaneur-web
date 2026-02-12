-- Fix: neighborhood_suggestions table was created from a prior incomplete attempt
-- that only had id, suggestion, created_at. Add missing columns.

ALTER TABLE neighborhood_suggestions ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE neighborhood_suggestions ADD COLUMN IF NOT EXISTS ip_address_hash TEXT;
ALTER TABLE neighborhood_suggestions ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE neighborhood_suggestions ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE neighborhood_suggestions ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- status column needs special handling since ADD COLUMN IF NOT EXISTS + NOT NULL + DEFAULT
-- can fail if column already exists with different constraints
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'neighborhood_suggestions' AND column_name = 'status'
  ) THEN
    ALTER TABLE neighborhood_suggestions ADD COLUMN status TEXT NOT NULL DEFAULT 'new';
  END IF;
END $$;

-- Add check constraint if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'neighborhood_suggestions_status_check'
  ) THEN
    ALTER TABLE neighborhood_suggestions ADD CONSTRAINT neighborhood_suggestions_status_check
      CHECK (status IN ('new', 'reviewed', 'added', 'dismissed'));
  END IF;
END $$;
