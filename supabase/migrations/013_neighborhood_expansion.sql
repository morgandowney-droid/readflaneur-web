-- Add columns for neighborhood expansion system
-- Allows grouping by region, country, and city + coordinate-based searching

ALTER TABLE neighborhoods ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE neighborhoods ADD COLUMN IF NOT EXISTS region TEXT; -- 'north-america', 'europe', 'asia-pacific', 'middle-east'
ALTER TABLE neighborhoods ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7);
ALTER TABLE neighborhoods ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7);
ALTER TABLE neighborhoods ADD COLUMN IF NOT EXISTS radius INTEGER DEFAULT 1000; -- meters
ALTER TABLE neighborhoods ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;
ALTER TABLE neighborhoods ADD COLUMN IF NOT EXISTS is_coming_soon BOOLEAN DEFAULT false;
ALTER TABLE neighborhoods ADD COLUMN IF NOT EXISTS seeded_at TIMESTAMPTZ; -- When neighborhood was first seeded (for "new" place detection)

-- Update existing neighborhoods with their data
-- Set seeded_at to now() for existing neighborhoods (they've already been seeded)
UPDATE neighborhoods SET
  country = 'USA',
  region = 'north-america',
  latitude = 40.7336,
  longitude = -74.0027,
  radius = 800,
  is_active = true,
  seeded_at = now()
WHERE id = 'nyc-west-village';

UPDATE neighborhoods SET
  country = 'UK',
  region = 'europe',
  latitude = 51.5117,
  longitude = -0.2054,
  radius = 1000,
  is_active = true,
  seeded_at = now()
WHERE id = 'london-notting-hill';

UPDATE neighborhoods SET
  country = 'USA',
  region = 'north-america',
  latitude = 37.7925,
  longitude = -122.4350,
  radius = 1000,
  is_active = true,
  seeded_at = now()
WHERE id = 'sf-pacific-heights';

UPDATE neighborhoods SET
  country = 'Sweden',
  region = 'europe',
  latitude = 59.3380,
  longitude = 18.0850,
  radius = 1200,
  is_active = true,
  seeded_at = now()
WHERE id = 'stockholm-ostermalm';

UPDATE neighborhoods SET
  country = 'Australia',
  region = 'asia-pacific',
  latitude = -33.8847,
  longitude = 151.2265,
  radius = 1000,
  is_active = true,
  seeded_at = now()
WHERE id = 'sydney-paddington';

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_neighborhoods_region ON neighborhoods(region);
CREATE INDEX IF NOT EXISTS idx_neighborhoods_country ON neighborhoods(country);
CREATE INDEX IF NOT EXISTS idx_neighborhoods_is_active ON neighborhoods(is_active);

-- Add comment for documentation
COMMENT ON COLUMN neighborhoods.region IS 'Global region: north-america, europe, asia-pacific, middle-east';
COMMENT ON COLUMN neighborhoods.radius IS 'Search radius in meters for Google Places API';
COMMENT ON COLUMN neighborhoods.is_active IS 'Whether this neighborhood has been seeded and is active for sync';
COMMENT ON COLUMN neighborhoods.is_coming_soon IS 'Show in UI as coming soon but not active';
COMMENT ON COLUMN neighborhoods.seeded_at IS 'When the neighborhood was first seeded - places discovered after this are marked as New';
