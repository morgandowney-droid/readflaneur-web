-- Add Michelin star ratings and designations to guide listings
-- These will be manually curated for notable restaurants

-- Add Michelin columns to guide_listings
ALTER TABLE guide_listings
ADD COLUMN IF NOT EXISTS michelin_stars INTEGER CHECK (michelin_stars >= 1 AND michelin_stars <= 3),
ADD COLUMN IF NOT EXISTS michelin_designation TEXT CHECK (michelin_designation IN ('star', 'bib_gourmand', 'green_star'));

-- Add index for filtering Michelin-rated places
CREATE INDEX IF NOT EXISTS idx_guide_listings_michelin ON guide_listings (michelin_stars) WHERE michelin_stars IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guide_listings_michelin_designation ON guide_listings (michelin_designation) WHERE michelin_designation IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN guide_listings.michelin_stars IS 'Michelin star rating (1-3). NULL if not rated.';
COMMENT ON COLUMN guide_listings.michelin_designation IS 'Michelin designation: star (for starred restaurants), bib_gourmand (good value), green_star (sustainable gastronomy)';
