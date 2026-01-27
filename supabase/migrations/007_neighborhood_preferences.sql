-- User Neighborhood Preferences
-- Stores which neighborhoods each user wants to follow

CREATE TABLE IF NOT EXISTS user_neighborhood_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  neighborhood_id TEXT REFERENCES neighborhoods(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, neighborhood_id)
);

-- Enable RLS
ALTER TABLE user_neighborhood_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read their own preferences
CREATE POLICY "Users can view own preferences"
  ON user_neighborhood_preferences FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own preferences
CREATE POLICY "Users can add own preferences"
  ON user_neighborhood_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own preferences
CREATE POLICY "Users can remove own preferences"
  ON user_neighborhood_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_neighborhood_prefs_user
  ON user_neighborhood_preferences(user_id);

-- Update newsletter_subscribers to track neighborhood preferences for non-logged-in users
ALTER TABLE newsletter_subscribers
ADD COLUMN IF NOT EXISTS neighborhood_ids TEXT[] DEFAULT '{}';
