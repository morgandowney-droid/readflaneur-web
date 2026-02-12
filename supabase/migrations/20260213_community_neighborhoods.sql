-- Community Neighborhoods: allow authenticated users to create their own neighborhoods
-- Adds columns to neighborhoods table for community-created neighborhoods

-- Add community columns to neighborhoods table
ALTER TABLE neighborhoods
  ADD COLUMN IF NOT EXISTS is_community BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS community_status TEXT DEFAULT 'active';

-- Add check constraint for community_status
ALTER TABLE neighborhoods
  ADD CONSTRAINT community_status_check CHECK (community_status IN ('active', 'removed'));

-- Index for fast limit check (how many community neighborhoods has this user created?)
CREATE INDEX IF NOT EXISTS idx_neighborhoods_created_by_community
  ON neighborhoods (created_by) WHERE is_community = true;

-- Index for filtering community neighborhoods
CREATE INDEX IF NOT EXISTS idx_neighborhoods_community_status
  ON neighborhoods (community_status) WHERE is_community = true;
