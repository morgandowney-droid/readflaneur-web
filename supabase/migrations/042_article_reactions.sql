-- Article reactions system (bookmark, heart, fire)
-- Replaces comments with lightweight emoji reactions

CREATE TABLE IF NOT EXISTS article_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_id text,
  reaction_type text NOT NULL CHECK (reaction_type IN ('bookmark', 'heart', 'fire')),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Each user/anon can only react once per type per article
  CONSTRAINT unique_user_reaction UNIQUE (article_id, user_id, reaction_type),
  CONSTRAINT unique_anon_reaction UNIQUE (article_id, anonymous_id, reaction_type),

  -- Must have either user_id or anonymous_id
  CONSTRAINT has_identity CHECK (user_id IS NOT NULL OR anonymous_id IS NOT NULL)
);

-- Indexes for fast lookups
CREATE INDEX idx_article_reactions_article ON article_reactions(article_id);
CREATE INDEX idx_article_reactions_user ON article_reactions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_article_reactions_anon ON article_reactions(anonymous_id) WHERE anonymous_id IS NOT NULL;

-- RLS policies
ALTER TABLE article_reactions ENABLE ROW LEVEL SECURITY;

-- Anyone can read reaction counts
CREATE POLICY "Reactions are publicly readable"
  ON article_reactions FOR SELECT
  USING (true);

-- Anyone can insert reactions
CREATE POLICY "Anyone can react"
  ON article_reactions FOR INSERT
  WITH CHECK (true);

-- Users can delete their own reactions (for toggle behavior)
CREATE POLICY "Users can remove own reactions"
  ON article_reactions FOR DELETE
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid()) OR
    (anonymous_id IS NOT NULL AND user_id IS NULL)
  );
