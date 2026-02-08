-- Sunday Edition Sponsorship: placement_type + body columns

-- Add placement_type column (daily_brief vs sunday_edition)
ALTER TABLE ads ADD COLUMN IF NOT EXISTS placement_type TEXT NOT NULL DEFAULT 'daily_brief';
ALTER TABLE ads ADD CONSTRAINT ads_placement_type_check
  CHECK (placement_type IN ('daily_brief', 'sunday_edition'));

-- Add body column for ad copy text
ALTER TABLE ads ADD COLUMN IF NOT EXISTS body TEXT;

-- Fast lookup index for active Sunday ads
CREATE INDEX IF NOT EXISTS idx_ads_sunday_active
  ON ads(placement_type, status, neighborhood_id)
  WHERE placement_type = 'sunday_edition' AND status = 'active';

-- Expand house_ads type constraint to include sunday_edition
ALTER TABLE house_ads DROP CONSTRAINT IF EXISTS house_ads_type_check;
ALTER TABLE house_ads ADD CONSTRAINT house_ads_type_check
  CHECK (type IN ('referral', 'waitlist', 'newsletter', 'app_download', 'advertise', 'sunday_edition'));

-- Seed Sunday Edition house ad (fallback)
INSERT INTO house_ads (type, headline, body, click_url, weight) VALUES
  ('sunday_edition', 'Become This Edition''s Presenting Sponsor',
   'Your brand, native in the most exclusive Sunday morning read.',
   '/advertise', 2);
