-- Add broader_area column to neighborhoods table
-- Stores the province/county/region name for fallback Unsplash image search
-- e.g., "Seville" for Utrera, "Andalusia" for small Andalusian towns
-- NULL for major cities where city name alone produces good Unsplash results
ALTER TABLE neighborhoods ADD COLUMN IF NOT EXISTS broader_area TEXT;
