-- Tidy neighborhood selector: renames, moves, and dedup

-- 1. Rename "Scarsdale" to "Scarsdale NY" and move to "New York Surroundings"
UPDATE neighborhoods SET name = 'Scarsdale NY', city = 'New York Surroundings' WHERE id = 'nyc-scarsdale';

-- 2. Deactivate duplicate "Aspen" under US Vacation (keep the one under Colorado)
UPDATE neighborhoods SET is_active = false WHERE id = 'us-aspen';

-- 3. Rename "Gstaad" to "Gstaad Swiss Alps" and move to "Alps"
UPDATE neighborhoods SET name = 'Gstaad Swiss Alps', city = 'Alps' WHERE id = 'swissalps-gstaad';

-- 4. Rename "St. Moritz" to "St. Moritz Swiss Alps" and move to "Alps"
UPDATE neighborhoods SET name = 'St. Moritz Swiss Alps', city = 'Alps' WHERE id = 'swissalps-st-moritz';

-- 5. Add "Zermatt Swiss Alps" as new neighborhood in "Alps"
INSERT INTO neighborhoods (id, name, city, region, country, is_active, latitude, longitude, timezone)
VALUES ('alps-zermatt', 'Zermatt Swiss Alps', 'Alps', 'europe', 'Switzerland', true, 46.0207, 7.7491, 'Europe/Zurich')
ON CONFLICT (id) DO NOTHING;

-- 6. Rename "Courchevel 1850" to "Courchevel 1850 French Alps"
UPDATE neighborhoods SET name = 'Courchevel 1850 French Alps' WHERE id = 'alps-courchevel';

-- 7. "Swiss Alps" city group is now empty (Gstaad and St. Moritz moved to "Alps") - no action needed

-- 8. Move "Greenwich Backcountry" to "New York Surroundings"
UPDATE neighborhoods SET city = 'New York Surroundings' WHERE id = 'greenwich-backcountry';

-- 9. Move "Saint-Tropez" from "European Vacation" to "French Riviera"
UPDATE neighborhoods SET city = 'French Riviera', region = 'europe' WHERE id = 'europe-saint-tropez';

-- 10 & 11 & 12. Rename region "Marbella" to "Costa del Sol", rename "Marbella" to "Marbella Municipality"
UPDATE neighborhoods SET name = 'Marbella Municipality', city = 'Costa del Sol', region = 'europe' WHERE id = 'europe-marbella';
UPDATE neighborhoods SET city = 'Costa del Sol' WHERE id = 'marbella-golden-mile';

-- 13. Move "The Hamptons" from us-vacation to north-america (alongside other Hamptons neighborhoods)
UPDATE neighborhoods SET region = 'north-america' WHERE id = 'us-hamptons';
