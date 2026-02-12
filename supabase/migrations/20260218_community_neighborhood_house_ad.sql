-- Add community_neighborhood type to house_ads and seed the record

-- Update the type check constraint to include community_neighborhood
ALTER TABLE house_ads DROP CONSTRAINT IF EXISTS house_ads_type_check;
ALTER TABLE house_ads ADD CONSTRAINT house_ads_type_check
  CHECK (type IN ('referral', 'waitlist', 'newsletter', 'app_download', 'advertise', 'suggest_neighborhood', 'sunday_edition', 'community_neighborhood'));

-- Seed the community neighborhood house ad
INSERT INTO house_ads (id, type, headline, body, image_url, click_url, weight, active)
VALUES (
  gen_random_uuid(),
  'community_neighborhood',
  'Create Your Own Neighborhood',
  'Any neighborhood in the world - one click and we handle the rest. Get a daily brief delivered to your inbox.',
  NULL,
  '#community',
  2,
  true
);
