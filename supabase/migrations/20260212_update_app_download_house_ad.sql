-- Update the app_download house ad to "Check Out a New Neighborhood"
UPDATE house_ads
SET
  headline = 'Check Out a New Neighborhood',
  body = 'See what''s happening today in a nearby neighborhood.',
  click_url = '/discover'
WHERE type = 'app_download';
