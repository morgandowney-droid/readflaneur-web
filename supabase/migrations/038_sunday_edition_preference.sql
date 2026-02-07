-- Add Sunday Edition email preference (independent from Daily Brief)
-- Defaults to true so all existing users get it

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS sunday_edition_enabled BOOLEAN DEFAULT true;

ALTER TABLE newsletter_subscribers
ADD COLUMN IF NOT EXISTS sunday_edition_enabled BOOLEAN DEFAULT true;
