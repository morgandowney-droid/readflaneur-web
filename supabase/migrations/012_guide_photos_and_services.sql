-- Migration: Guide Photos and Services Subcategories
-- Adds photo support and expands Services category

-- 1. Add photo URL and location fields to guide_listings
ALTER TABLE guide_listings
ADD COLUMN IF NOT EXISTS google_photo_url TEXT,
ADD COLUMN IF NOT EXISTS google_photo_reference TEXT, -- For fetching fresh photos
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7);

-- 2. Create subcategories table for nested categorization
CREATE TABLE IF NOT EXISTS guide_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES guide_categories(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(10),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Google Places mapping
  google_place_types TEXT[], -- Array of Google Place types to search

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category_id, slug)
);

CREATE INDEX idx_guide_subcategories_category ON guide_subcategories (category_id, display_order);

-- 3. Add subcategory reference to listings
ALTER TABLE guide_listings
ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES guide_subcategories(id);

CREATE INDEX idx_guide_listings_subcategory ON guide_listings (subcategory_id);

-- 4. Get the Services category ID and insert subcategories
DO $$
DECLARE
  services_cat_id UUID;
BEGIN
  -- Get Services category ID
  SELECT id INTO services_cat_id FROM guide_categories WHERE slug = 'services';

  IF services_cat_id IS NOT NULL THEN
    -- Insert Services subcategories
    INSERT INTO guide_subcategories (category_id, name, slug, icon, display_order, google_place_types) VALUES
      (services_cat_id, 'Nanny & Childcare', 'nanny', '👶', 1, ARRAY['child_care_agency']),
      (services_cat_id, 'Personal Chefs', 'personal-chefs', '👨‍🍳', 2, ARRAY['caterer', 'meal_delivery']),
      (services_cat_id, 'Event Catering', 'event-catering', '🍽️', 3, ARRAY['caterer', 'event_planner']),
      (services_cat_id, 'Party Organizers', 'party-organizers', '🎉', 4, ARRAY['event_planner', 'party_rental']),
      (services_cat_id, 'Holiday Decoration', 'holiday-decoration', '🎄', 5, ARRAY['home_improvement_store', 'florist']),
      (services_cat_id, 'Dry Cleaning & Laundry', 'dry-cleaning', '👔', 6, ARRAY['dry_cleaning', 'laundry']),
      (services_cat_id, 'Housekeeping', 'housekeeping', '🧹', 7, ARRAY['house_cleaning_service']),
      (services_cat_id, 'Pet Walkers', 'pet-walkers', '🐕', 8, ARRAY['dog_walker', 'pet_store']),
      (services_cat_id, 'School Advisors', 'school-advisors', '🎓', 9, ARRAY['educational_consultant', 'tutoring_service']),
      (services_cat_id, 'Tutors', 'tutors', '📚', 10, ARRAY['tutoring_service', 'educational_consultant']),
      (services_cat_id, 'Veterinarians', 'vets', '🏥', 11, ARRAY['veterinary_care', 'pet_store'])
    ON CONFLICT (category_id, slug) DO NOTHING;
  END IF;
END $$;

-- 5. Enable RLS on new table
ALTER TABLE guide_subcategories ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for subcategories
CREATE POLICY "Anyone can view active subcategories" ON guide_subcategories
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage subcategories" ON guide_subcategories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- 7. Updated_at trigger for subcategories
CREATE OR REPLACE FUNCTION update_guide_subcategories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guide_subcategories_updated_at
  BEFORE UPDATE ON guide_subcategories
  FOR EACH ROW
  EXECUTE FUNCTION update_guide_subcategories_updated_at();
