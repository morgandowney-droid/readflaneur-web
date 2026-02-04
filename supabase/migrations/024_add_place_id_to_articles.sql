-- Add place_id column to articles for linking to guide_listings (openings/closings)
ALTER TABLE articles
ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES guide_listings(id);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_articles_place_id ON articles(place_id);

-- Create index on article_type for filtering
CREATE INDEX IF NOT EXISTS idx_articles_article_type ON articles(article_type);
