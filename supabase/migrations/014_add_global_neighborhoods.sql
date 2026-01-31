-- Add top global neighborhoods + Berlin and Washington DC wealthy areas
-- These will need to be seeded via the admin endpoint before becoming active

-- ============================================
-- NEW YORK CITY (USA)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('nyc-upper-east-side', 'Upper East Side', 'New York', 'America/New_York', 'USA', 'north-america', 40.7736, -73.9566, 1200, false, true),
  ('nyc-tribeca', 'Tribeca', 'New York', 'America/New_York', 'USA', 'north-america', 40.7163, -74.0086, 800, false, true),
  ('nyc-soho', 'SoHo', 'New York', 'America/New_York', 'USA', 'north-america', 40.7233, -74.0030, 700, false, true),
  ('nyc-greenwich-village', 'Greenwich Village', 'New York', 'America/New_York', 'USA', 'north-america', 40.7336, -73.9996, 800, false, true),
  ('nyc-chelsea', 'Chelsea', 'New York', 'America/New_York', 'USA', 'north-america', 40.7465, -74.0014, 900, false, true),
  ('nyc-williamsburg', 'Williamsburg', 'New York', 'America/New_York', 'USA', 'north-america', 40.7081, -73.9571, 1000, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SAN FRANCISCO (USA)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('sf-noe-valley', 'Noe Valley', 'San Francisco', 'America/Los_Angeles', 'USA', 'north-america', 37.7502, -122.4337, 900, false, true),
  ('sf-marina', 'Marina District', 'San Francisco', 'America/Los_Angeles', 'USA', 'north-america', 37.8037, -122.4368, 1000, false, true),
  ('sf-russian-hill', 'Russian Hill', 'San Francisco', 'America/Los_Angeles', 'USA', 'north-america', 37.8011, -122.4194, 800, false, true),
  ('sf-hayes-valley', 'Hayes Valley', 'San Francisco', 'America/Los_Angeles', 'USA', 'north-america', 37.7759, -122.4245, 700, false, true),
  ('sf-mission', 'The Mission', 'San Francisco', 'America/Los_Angeles', 'USA', 'north-america', 37.7599, -122.4148, 1000, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- LOS ANGELES (USA)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('la-beverly-hills', 'Beverly Hills', 'Los Angeles', 'America/Los_Angeles', 'USA', 'north-america', 34.0736, -118.4004, 1500, false, true),
  ('la-santa-monica', 'Santa Monica', 'Los Angeles', 'America/Los_Angeles', 'USA', 'north-america', 34.0195, -118.4912, 1500, false, true),
  ('la-west-hollywood', 'West Hollywood', 'Los Angeles', 'America/Los_Angeles', 'USA', 'north-america', 34.0900, -118.3617, 1200, false, true),
  ('la-venice', 'Venice', 'Los Angeles', 'America/Los_Angeles', 'USA', 'north-america', 33.9850, -118.4695, 1200, false, true),
  ('la-silver-lake', 'Silver Lake', 'Los Angeles', 'America/Los_Angeles', 'USA', 'north-america', 34.0869, -118.2702, 1000, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- WASHINGTON DC (USA) - Wealthy neighborhoods
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('dc-georgetown', 'Georgetown', 'Washington DC', 'America/New_York', 'USA', 'north-america', 38.9076, -77.0723, 1200, false, true),
  ('dc-dupont-circle', 'Dupont Circle', 'Washington DC', 'America/New_York', 'USA', 'north-america', 38.9096, -77.0434, 900, false, true),
  ('dc-capitol-hill', 'Capitol Hill', 'Washington DC', 'America/New_York', 'USA', 'north-america', 38.8899, -76.9958, 1200, false, true),
  ('dc-adams-morgan', 'Adams Morgan', 'Washington DC', 'America/New_York', 'USA', 'north-america', 38.9214, -77.0424, 800, false, true),
  ('dc-kalorama', 'Kalorama', 'Washington DC', 'America/New_York', 'USA', 'north-america', 38.9215, -77.0550, 700, false, true),
  ('dc-cleveland-park', 'Cleveland Park', 'Washington DC', 'America/New_York', 'USA', 'north-america', 38.9365, -77.0585, 900, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- CHICAGO (USA)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('chicago-lincoln-park', 'Lincoln Park', 'Chicago', 'America/Chicago', 'USA', 'north-america', 41.9214, -87.6513, 1500, false, true),
  ('chicago-gold-coast', 'Gold Coast', 'Chicago', 'America/Chicago', 'USA', 'north-america', 41.9044, -87.6278, 800, false, true),
  ('chicago-wicker-park', 'Wicker Park', 'Chicago', 'America/Chicago', 'USA', 'north-america', 41.9088, -87.6796, 900, false, true),
  ('chicago-river-north', 'River North', 'Chicago', 'America/Chicago', 'USA', 'north-america', 41.8924, -87.6341, 900, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MIAMI (USA)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('miami-south-beach', 'South Beach', 'Miami', 'America/New_York', 'USA', 'north-america', 25.7825, -80.1340, 1500, false, true),
  ('miami-coconut-grove', 'Coconut Grove', 'Miami', 'America/New_York', 'USA', 'north-america', 25.7270, -80.2414, 1200, false, true),
  ('miami-coral-gables', 'Coral Gables', 'Miami', 'America/New_York', 'USA', 'north-america', 25.7215, -80.2684, 1500, false, true),
  ('miami-brickell', 'Brickell', 'Miami', 'America/New_York', 'USA', 'north-america', 25.7617, -80.1918, 1000, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- LONDON (UK)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('london-chelsea', 'Chelsea', 'London', 'Europe/London', 'UK', 'europe', 51.4875, -0.1687, 1200, false, true),
  ('london-mayfair', 'Mayfair', 'London', 'Europe/London', 'UK', 'europe', 51.5099, -0.1478, 900, false, true),
  ('london-kensington', 'Kensington', 'London', 'Europe/London', 'UK', 'europe', 51.4990, -0.1939, 1200, false, true),
  ('london-hampstead', 'Hampstead', 'London', 'Europe/London', 'UK', 'europe', 51.5557, -0.1780, 1200, false, true),
  ('london-shoreditch', 'Shoreditch', 'London', 'Europe/London', 'UK', 'europe', 51.5263, -0.0795, 900, false, true),
  ('london-marylebone', 'Marylebone', 'London', 'Europe/London', 'UK', 'europe', 51.5203, -0.1537, 900, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PARIS (France)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('paris-le-marais', 'Le Marais', 'Paris', 'Europe/Paris', 'France', 'europe', 48.8566, 2.3622, 900, false, true),
  ('paris-saint-germain', 'Saint-Germain-des-Prés', 'Paris', 'Europe/Paris', 'France', 'europe', 48.8539, 2.3338, 900, false, true),
  ('paris-montmartre', 'Montmartre', 'Paris', 'Europe/Paris', 'France', 'europe', 48.8867, 2.3431, 1000, false, true),
  ('paris-16th', '16th Arrondissement', 'Paris', 'Europe/Paris', 'France', 'europe', 48.8637, 2.2769, 1500, false, true),
  ('paris-7th', '7th Arrondissement', 'Paris', 'Europe/Paris', 'France', 'europe', 48.8566, 2.3150, 1200, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- BERLIN (Germany) - Wealthy neighborhoods
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('berlin-charlottenburg', 'Charlottenburg', 'Berlin', 'Europe/Berlin', 'Germany', 'europe', 52.5163, 13.3040, 1500, false, true),
  ('berlin-grunewald', 'Grunewald', 'Berlin', 'Europe/Berlin', 'Germany', 'europe', 52.4833, 13.2667, 1500, false, true),
  ('berlin-dahlem', 'Dahlem', 'Berlin', 'Europe/Berlin', 'Germany', 'europe', 52.4581, 13.2878, 1200, false, true),
  ('berlin-zehlendorf', 'Zehlendorf', 'Berlin', 'Europe/Berlin', 'Germany', 'europe', 52.4344, 13.2594, 1200, false, true),
  ('berlin-prenzlauer-berg', 'Prenzlauer Berg', 'Berlin', 'Europe/Berlin', 'Germany', 'europe', 52.5387, 13.4244, 1200, false, true),
  ('berlin-mitte', 'Mitte', 'Berlin', 'Europe/Berlin', 'Germany', 'europe', 52.5200, 13.4050, 1200, false, true),
  ('berlin-kreuzberg', 'Kreuzberg', 'Berlin', 'Europe/Berlin', 'Germany', 'europe', 52.4934, 13.4234, 1200, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- AMSTERDAM (Netherlands)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('amsterdam-jordaan', 'Jordaan', 'Amsterdam', 'Europe/Amsterdam', 'Netherlands', 'europe', 52.3752, 4.8819, 800, false, true),
  ('amsterdam-de-pijp', 'De Pijp', 'Amsterdam', 'Europe/Amsterdam', 'Netherlands', 'europe', 52.3522, 4.8937, 900, false, true),
  ('amsterdam-oud-zuid', 'Oud-Zuid', 'Amsterdam', 'Europe/Amsterdam', 'Netherlands', 'europe', 52.3500, 4.8700, 1200, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- BARCELONA (Spain)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('barcelona-eixample', 'Eixample', 'Barcelona', 'Europe/Madrid', 'Spain', 'europe', 41.3917, 2.1649, 1500, false, true),
  ('barcelona-gracia', 'Gràcia', 'Barcelona', 'Europe/Madrid', 'Spain', 'europe', 41.4036, 2.1567, 1000, false, true),
  ('barcelona-el-born', 'El Born', 'Barcelona', 'Europe/Madrid', 'Spain', 'europe', 41.3851, 2.1834, 700, false, true),
  ('barcelona-barceloneta', 'Barceloneta', 'Barcelona', 'Europe/Madrid', 'Spain', 'europe', 41.3807, 2.1892, 800, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MILAN (Italy)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('milan-brera', 'Brera', 'Milan', 'Europe/Rome', 'Italy', 'europe', 45.4722, 9.1867, 800, false, true),
  ('milan-porta-nuova', 'Porta Nuova', 'Milan', 'Europe/Rome', 'Italy', 'europe', 45.4833, 9.1900, 900, false, true),
  ('milan-navigli', 'Navigli', 'Milan', 'Europe/Rome', 'Italy', 'europe', 45.4500, 9.1700, 1000, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TOKYO (Japan)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('tokyo-shibuya', 'Shibuya', 'Tokyo', 'Asia/Tokyo', 'Japan', 'asia-pacific', 35.6580, 139.7016, 1200, false, true),
  ('tokyo-ginza', 'Ginza', 'Tokyo', 'Asia/Tokyo', 'Japan', 'asia-pacific', 35.6717, 139.7649, 1000, false, true),
  ('tokyo-roppongi', 'Roppongi', 'Tokyo', 'Asia/Tokyo', 'Japan', 'asia-pacific', 35.6628, 139.7315, 1000, false, true),
  ('tokyo-aoyama', 'Aoyama', 'Tokyo', 'Asia/Tokyo', 'Japan', 'asia-pacific', 35.6690, 139.7188, 900, false, true),
  ('tokyo-daikanyama', 'Daikanyama', 'Tokyo', 'Asia/Tokyo', 'Japan', 'asia-pacific', 35.6489, 139.7033, 700, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- HONG KONG
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('hk-central', 'Central', 'Hong Kong', 'Asia/Hong_Kong', 'Hong Kong', 'asia-pacific', 22.2816, 114.1585, 1000, false, true),
  ('hk-the-peak', 'The Peak', 'Hong Kong', 'Asia/Hong_Kong', 'Hong Kong', 'asia-pacific', 22.2759, 114.1455, 1200, false, true),
  ('hk-soho', 'SoHo', 'Hong Kong', 'Asia/Hong_Kong', 'Hong Kong', 'asia-pacific', 22.2820, 114.1510, 600, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SINGAPORE
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('singapore-orchard', 'Orchard', 'Singapore', 'Asia/Singapore', 'Singapore', 'asia-pacific', 1.3048, 103.8318, 1200, false, true),
  ('singapore-marina-bay', 'Marina Bay', 'Singapore', 'Asia/Singapore', 'Singapore', 'asia-pacific', 1.2834, 103.8607, 1500, false, true),
  ('singapore-tiong-bahru', 'Tiong Bahru', 'Singapore', 'Asia/Singapore', 'Singapore', 'asia-pacific', 1.2863, 103.8273, 900, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MELBOURNE (Australia)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('melbourne-south-yarra', 'South Yarra', 'Melbourne', 'Australia/Melbourne', 'Australia', 'asia-pacific', -37.8380, 144.9930, 1200, false, true),
  ('melbourne-fitzroy', 'Fitzroy', 'Melbourne', 'Australia/Melbourne', 'Australia', 'asia-pacific', -37.7987, 144.9780, 900, false, true),
  ('melbourne-st-kilda', 'St Kilda', 'Melbourne', 'Australia/Melbourne', 'Australia', 'asia-pacific', -37.8676, 144.9809, 1200, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TORONTO (Canada)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('toronto-yorkville', 'Yorkville', 'Toronto', 'America/Toronto', 'Canada', 'north-america', 43.6708, -79.3935, 900, false, true),
  ('toronto-queen-west', 'Queen West', 'Toronto', 'America/Toronto', 'Canada', 'north-america', 43.6465, -79.4078, 1200, false, true),
  ('toronto-distillery', 'Distillery District', 'Toronto', 'America/Toronto', 'Canada', 'north-america', 43.6503, -79.3597, 600, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DUBAI (UAE)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('dubai-downtown', 'Downtown Dubai', 'Dubai', 'Asia/Dubai', 'UAE', 'middle-east', 25.1972, 55.2744, 1500, false, true),
  ('dubai-jumeirah', 'Jumeirah', 'Dubai', 'Asia/Dubai', 'UAE', 'middle-east', 25.2048, 55.2356, 2000, false, true),
  ('dubai-difc', 'DIFC', 'Dubai', 'Asia/Dubai', 'UAE', 'middle-east', 25.2109, 55.2815, 800, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TEL AVIV (Israel)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('telaviv-rothschild', 'Rothschild Boulevard', 'Tel Aviv', 'Asia/Jerusalem', 'Israel', 'middle-east', 32.0636, 34.7731, 900, false, true),
  ('telaviv-neve-tzedek', 'Neve Tzedek', 'Tel Aviv', 'Asia/Jerusalem', 'Israel', 'middle-east', 32.0589, 34.7656, 700, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- LISBON (Portugal)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('lisbon-chiado', 'Chiado', 'Lisbon', 'Europe/Lisbon', 'Portugal', 'europe', 38.7103, -9.1426, 700, false, true),
  ('lisbon-alfama', 'Alfama', 'Lisbon', 'Europe/Lisbon', 'Portugal', 'europe', 38.7118, -9.1281, 800, false, true),
  ('lisbon-principe-real', 'Príncipe Real', 'Lisbon', 'Europe/Lisbon', 'Portugal', 'europe', 38.7178, -9.1489, 600, false, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- COPENHAGEN (Denmark)
-- ============================================
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_coming_soon)
VALUES
  ('copenhagen-nyhavn', 'Nyhavn', 'Copenhagen', 'Europe/Copenhagen', 'Denmark', 'europe', 55.6800, 12.5900, 700, false, true),
  ('copenhagen-vesterbro', 'Vesterbro', 'Copenhagen', 'Europe/Copenhagen', 'Denmark', 'europe', 55.6689, 12.5478, 1000, false, true),
  ('copenhagen-norrebro', 'Nørrebro', 'Copenhagen', 'Europe/Copenhagen', 'Denmark', 'europe', 55.6961, 12.5483, 1200, false, true)
ON CONFLICT (id) DO NOTHING;

-- Summary: ~60 new neighborhoods added
-- To activate, use the admin seed-neighborhood endpoint for each one
