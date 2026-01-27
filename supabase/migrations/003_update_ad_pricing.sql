-- Update ad package pricing to premium rates
-- Based on Tribeca Citizen model (~$500k/year revenue)

-- Update existing packages with new pricing
UPDATE ad_packages SET price_cents = 15000, description = 'Perfect for testing campaigns' WHERE name = 'Weekly Local';
UPDATE ad_packages SET price_cents = 50000, description = 'Best value for local businesses' WHERE name = 'Monthly Local';
UPDATE ad_packages SET price_cents = 150000, description = 'Reach an entire city' WHERE name = 'City-Wide';
UPDATE ad_packages SET price_cents = 300000, description = 'Maximum reach across all markets' WHERE name = 'Global';

-- Add newsletter sponsorship packages
INSERT INTO ad_packages (name, description, price_cents, duration_days, is_global, max_neighborhoods) VALUES
  ('Newsletter Sponsor - Single', 'Sponsor one newsletter issue', 20000, 1, FALSE, 1),
  ('Newsletter Sponsor - Weekly', 'Sponsor 4 newsletter issues', 70000, 7, FALSE, 1),
  ('Newsletter Sponsor - Monthly', 'Sponsor all newsletter issues for a month', 25000, 30, FALSE, 1),
  ('Dedicated Email Blast', 'Exclusive email to all subscribers in your target neighborhood', 80000, 1, FALSE, 1)
ON CONFLICT DO NOTHING;

-- Add placement column to ad_packages if not exists
ALTER TABLE ad_packages ADD COLUMN IF NOT EXISTS placement TEXT DEFAULT 'feed' CHECK (placement IN ('feed', 'story_open', 'newsletter', 'email_blast'));

-- Update placements for new packages
UPDATE ad_packages SET placement = 'newsletter' WHERE name LIKE 'Newsletter Sponsor%';
UPDATE ad_packages SET placement = 'email_blast' WHERE name = 'Dedicated Email Blast';

-- Add column to ads table for placement type
ALTER TABLE ads ADD COLUMN IF NOT EXISTS placement TEXT DEFAULT 'feed' CHECK (placement IN ('feed', 'story_open', 'newsletter', 'email_blast'));
