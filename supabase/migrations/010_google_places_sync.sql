-- Add Google Places sync fields to guide_listings

ALTER TABLE guide_listings
ADD COLUMN IF NOT EXISTS google_place_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS google_rating DECIMAL(2,1),
ADD COLUMN IF NOT EXISTS google_reviews_count INTEGER;

-- Index for faster lookups during sync
CREATE INDEX IF NOT EXISTS idx_guide_listings_google_place_id ON guide_listings(google_place_id);
