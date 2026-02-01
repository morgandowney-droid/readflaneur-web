-- Add 4 wealthy Sydney neighborhoods

INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_coming_soon, is_active)
VALUES
  ('sydney-double-bay', 'Double Bay', 'Sydney', 'Australia/Sydney', 'Australia', 'asia-pacific', -33.8779, 151.2430, 800, false, true),
  ('sydney-mosman', 'Mosman', 'Sydney', 'Australia/Sydney', 'Australia', 'asia-pacific', -33.8290, 151.2440, 1000, false, true),
  ('sydney-woollahra', 'Woollahra', 'Sydney', 'Australia/Sydney', 'Australia', 'asia-pacific', -33.8880, 151.2390, 800, false, true),
  ('sydney-vaucluse', 'Vaucluse', 'Sydney', 'Australia/Sydney', 'Australia', 'asia-pacific', -33.8580, 151.2780, 1000, false, true)
ON CONFLICT (id) DO UPDATE SET
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  radius = EXCLUDED.radius,
  country = EXCLUDED.country,
  region = EXCLUDED.region,
  is_active = true;
