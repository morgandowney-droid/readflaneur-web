-- Add theme and language preferences to profiles for cross-device persistence
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_theme TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_language TEXT;
