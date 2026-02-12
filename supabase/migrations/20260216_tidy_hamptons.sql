-- Tidy The Hamptons region

-- 1a. Add Southampton (Hamptons)
INSERT INTO neighborhoods (id, name, city, region, country, is_active, latitude, longitude, timezone)
VALUES ('hamptons-southampton', 'Southampton (Hamptons)', 'The Hamptons', 'north-america', 'USA', true, 40.8843, -72.3893, 'America/New_York')
ON CONFLICT (id) DO NOTHING;

-- 1b. Add Bridgehampton (Hamptons)
INSERT INTO neighborhoods (id, name, city, region, country, is_active, latitude, longitude, timezone)
VALUES ('hamptons-bridgehampton', 'Bridgehampton (Hamptons)', 'The Hamptons', 'north-america', 'USA', true, 40.9382, -72.3007, 'America/New_York')
ON CONFLICT (id) DO NOTHING;

-- 1c. Add Amagansett (Hamptons)
INSERT INTO neighborhoods (id, name, city, region, country, is_active, latitude, longitude, timezone)
VALUES ('hamptons-amagansett', 'Amagansett (Hamptons)', 'The Hamptons', 'north-america', 'USA', true, 40.9732, -72.1432, 'America/New_York')
ON CONFLICT (id) DO NOTHING;

-- 2. Rename "Hamptons (Sagaponack)" to "Sagaponack (Hamptons)"
UPDATE neighborhoods SET name = 'Sagaponack (Hamptons)' WHERE id = 'hamptons-sagaponack';

-- 3. Rename "The Hamptons" to "The Hamptons Overview"
UPDATE neighborhoods SET name = 'The Hamptons Overview' WHERE id = 'us-hamptons';
