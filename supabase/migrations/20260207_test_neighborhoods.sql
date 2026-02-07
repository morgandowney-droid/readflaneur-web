-- Test Lab neighborhoods for exploring non-standard geographic scales
-- These are experimental: county, country, city-wide, and country-wide

INSERT INTO neighborhoods (id, name, city, country, region, timezone, latitude, longitude, radius, is_active, is_combo)
VALUES
  ('ie-county-limerick', 'County Limerick', 'Limerick', 'Ireland', 'test', 'Europe/Dublin', 52.6638, -8.6267, 30000, true, false),
  ('ie-ireland', 'Ireland', 'Ireland', 'Ireland', 'test', 'Europe/Dublin', 53.4129, -8.2439, 200000, true, false),
  ('se-stockholm', 'Stockholm', 'Stockholm', 'Sweden', 'test', 'Europe/Stockholm', 59.3293, 18.0686, 15000, true, false),
  ('se-sweden', 'Sweden', 'Sweden', 'Sweden', 'test', 'Europe/Stockholm', 62.0000, 15.0000, 500000, true, false)
ON CONFLICT (id) DO NOTHING;
