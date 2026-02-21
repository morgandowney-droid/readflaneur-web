-- Update Sunday Edition house ad text
-- "native in" -> "living in", "Let's Take a Quick Look" -> "Place it Now"
UPDATE house_ads
SET body = 'Your brand, living in the most exclusive Sunday morning read.',
    headline = 'The Sunday Edition'
WHERE type = 'sunday_edition';
