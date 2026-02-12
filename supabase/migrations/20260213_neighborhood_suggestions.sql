-- Neighborhood Suggestions: readers can suggest neighborhoods to add to Flaneur

CREATE TABLE IF NOT EXISTS neighborhood_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion TEXT NOT NULL,
  email TEXT,
  ip_address_hash TEXT,
  city TEXT,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'added', 'dismissed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE neighborhood_suggestions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'neighborhood_suggestions' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON neighborhood_suggestions
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Update house_ads type constraint to include suggest_neighborhood
ALTER TABLE house_ads DROP CONSTRAINT IF EXISTS house_ads_type_check;
ALTER TABLE house_ads ADD CONSTRAINT house_ads_type_check
  CHECK (type IN ('referral', 'waitlist', 'newsletter', 'app_download', 'advertise', 'suggest_neighborhood', 'sunday_edition'));

-- Seed suggest_neighborhood house ad (idempotent)
INSERT INTO house_ads (type, headline, body, click_url, weight, active)
SELECT 'suggest_neighborhood', 'Suggest a Neighborhood', 'Request a neighborhood to be added to Flaneur.', '#suggest', 2, true
WHERE NOT EXISTS (SELECT 1 FROM house_ads WHERE type = 'suggest_neighborhood');
