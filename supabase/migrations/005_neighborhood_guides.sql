-- Neighborhood Guides System
-- Evergreen curated content like restaurant guides, shopping guides, etc.

-- Guide categories
CREATE TABLE IF NOT EXISTS guide_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT, -- emoji or icon name
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default categories
INSERT INTO guide_categories (name, slug, icon, description, display_order) VALUES
  ('Restaurants', 'restaurants', '🍽️', 'Where to eat in the neighborhood', 1),
  ('Coffee & Cafes', 'coffee-cafes', '☕', 'Best spots for coffee and pastries', 2),
  ('Bars & Nightlife', 'bars-nightlife', '🍸', 'Where to drink after dark', 3),
  ('Shopping', 'shopping', '🛍️', 'Boutiques, shops, and stores', 4),
  ('Services', 'services', '💇', 'Salons, gyms, dry cleaners, and more', 5),
  ('Parks & Recreation', 'parks-recreation', '🌳', 'Green spaces and outdoor activities', 6),
  ('Arts & Culture', 'arts-culture', '🎨', 'Galleries, theaters, and cultural venues', 7),
  ('Family & Kids', 'family-kids', '👶', 'Family-friendly spots and activities', 8)
ON CONFLICT (slug) DO NOTHING;

-- Guide listings (individual places in each guide)
CREATE TABLE IF NOT EXISTS guide_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  neighborhood_id TEXT NOT NULL REFERENCES neighborhoods(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES guide_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  description TEXT,
  website_url TEXT,
  phone TEXT,
  price_range TEXT CHECK (price_range IN ('$', '$$', '$$$', '$$$$')),
  tags TEXT[], -- e.g., ['outdoor seating', 'dog friendly', 'reservations required']
  image_url TEXT,
  is_featured BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_guide_listings_neighborhood ON guide_listings(neighborhood_id);
CREATE INDEX IF NOT EXISTS idx_guide_listings_category ON guide_listings(category_id);
CREATE INDEX IF NOT EXISTS idx_guide_listings_featured ON guide_listings(is_featured) WHERE is_featured = TRUE;

-- RLS
ALTER TABLE guide_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guide categories are public" ON guide_categories FOR SELECT USING (true);
CREATE POLICY "Guide listings are public" ON guide_listings FOR SELECT USING (is_active = true);

-- Admin can manage (via service role key)
CREATE POLICY "Authenticated can manage guide_categories" ON guide_categories FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage guide_listings" ON guide_listings FOR ALL USING (auth.role() = 'authenticated');

-- Seed some example listings for West Village
INSERT INTO guide_listings (neighborhood_id, category_id, name, address, description, price_range, tags, is_featured)
SELECT
  'nyc-west-village',
  gc.id,
  'Via Carota',
  '51 Grove St',
  'Beloved Italian spot known for its cacio e pepe and charming garden. Expect a wait but worth it.',
  '$$$',
  ARRAY['no reservations', 'outdoor seating', 'cash only'],
  TRUE
FROM guide_categories gc WHERE gc.slug = 'restaurants'
ON CONFLICT DO NOTHING;

INSERT INTO guide_listings (neighborhood_id, category_id, name, address, description, price_range, tags)
SELECT
  'nyc-west-village',
  gc.id,
  'Joe Coffee',
  '141 Waverly Pl',
  'The original Joe location. Perfect espresso, knowledgeable baristas, and a true neighborhood feel.',
  '$',
  ARRAY['wifi', 'laptop friendly']
FROM guide_categories gc WHERE gc.slug = 'coffee-cafes'
ON CONFLICT DO NOTHING;

INSERT INTO guide_listings (neighborhood_id, category_id, name, address, description, price_range, tags, is_featured)
SELECT
  'nyc-west-village',
  gc.id,
  'Employees Only',
  '510 Hudson St',
  'Speakeasy-style cocktail bar with expertly crafted drinks and late-night kitchen.',
  '$$$',
  ARRAY['craft cocktails', 'late night', 'reservations recommended'],
  TRUE
FROM guide_categories gc WHERE gc.slug = 'bars-nightlife'
ON CONFLICT DO NOTHING;
