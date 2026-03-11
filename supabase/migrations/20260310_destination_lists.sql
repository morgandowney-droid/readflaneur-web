-- Destination Lists: Named, shareable neighborhood collections
-- Replaces flat user_neighborhood_preferences with structured list system

-- 1. Create destination_lists table
CREATE TABLE IF NOT EXISTS destination_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,
  share_token TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

-- 2. Create destination_list_items table
CREATE TABLE IF NOT EXISTS destination_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES destination_lists(id) ON DELETE CASCADE,
  neighborhood_id TEXT NOT NULL REFERENCES neighborhoods(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, neighborhood_id)
);

-- 3. Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_destination_lists_user_id ON destination_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_destination_lists_share_token ON destination_lists(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_destination_list_items_list_id ON destination_list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_destination_list_items_neighborhood_id ON destination_list_items(neighborhood_id);

-- 4. Enable RLS
ALTER TABLE destination_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE destination_list_items ENABLE ROW LEVEL SECURITY;

-- RLS for destination_lists
CREATE POLICY "Users can view their own lists"
  ON destination_lists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own lists"
  ON destination_lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lists"
  ON destination_lists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lists"
  ON destination_lists FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Public lists are viewable by anyone"
  ON destination_lists FOR SELECT
  USING (is_public = true);

-- Service role bypass for API routes
CREATE POLICY "Service role full access on destination_lists"
  ON destination_lists FOR ALL
  USING (auth.role() = 'service_role');

-- RLS for destination_list_items
CREATE POLICY "Users can view items in their lists"
  ON destination_list_items FOR SELECT
  USING (
    list_id IN (SELECT id FROM destination_lists WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can add items to their lists"
  ON destination_list_items FOR INSERT
  WITH CHECK (
    list_id IN (SELECT id FROM destination_lists WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update items in their lists"
  ON destination_list_items FOR UPDATE
  USING (
    list_id IN (SELECT id FROM destination_lists WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can remove items from their lists"
  ON destination_list_items FOR DELETE
  USING (
    list_id IN (SELECT id FROM destination_lists WHERE user_id = auth.uid())
  );

CREATE POLICY "Public list items viewable by anyone"
  ON destination_list_items FOR SELECT
  USING (
    list_id IN (SELECT id FROM destination_lists WHERE is_public = true)
  );

CREATE POLICY "Service role full access on destination_list_items"
  ON destination_list_items FOR ALL
  USING (auth.role() = 'service_role');

-- 5. Migrate existing user_neighborhood_preferences into destination_lists
-- For each user with preferences, create a default "My Feed" list and copy items
INSERT INTO destination_lists (user_id, name, slug, is_default, created_at)
SELECT DISTINCT user_id, 'My Feed', 'my-feed', true, NOW()
FROM user_neighborhood_preferences
WHERE user_id IS NOT NULL
ON CONFLICT (user_id, slug) DO NOTHING;

-- Copy neighborhood preferences into list items with arbitrary sort order
INSERT INTO destination_list_items (list_id, neighborhood_id, sort_order, added_at)
SELECT
  dl.id,
  unp.neighborhood_id,
  ROW_NUMBER() OVER (PARTITION BY unp.user_id ORDER BY unp.created_at) - 1,
  COALESCE(unp.created_at, NOW())
FROM user_neighborhood_preferences unp
JOIN destination_lists dl ON dl.user_id = unp.user_id AND dl.is_default = true
ON CONFLICT (list_id, neighborhood_id) DO NOTHING;

-- 6. Add has_migrated_lists flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_migrated_lists BOOLEAN DEFAULT false;

-- Mark all migrated users
UPDATE profiles
SET has_migrated_lists = true
WHERE id IN (SELECT DISTINCT user_id FROM destination_lists WHERE is_default = true);
