-- Native Comments System with Moderation
-- Replaces Disqus with a built-in solution

-- 1. Comments table
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE, -- For replies
  author_name TEXT NOT NULL, -- Display name (can be anonymous)
  author_email TEXT, -- Optional, for notifications
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'flagged')),
  moderation_score FLOAT, -- AI moderation confidence score
  moderation_categories JSONB, -- Flagged categories from OpenAI
  ip_hash TEXT, -- For spam prevention
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_comments_article_id ON comments(article_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);

-- 2. Comment votes (like/dislike)
CREATE TABLE IF NOT EXISTS comment_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  ip_hash TEXT, -- For anonymous voting
  vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, user_id),
  UNIQUE(comment_id, ip_hash)
);

-- 3. Blocked words table for quick filtering (before AI check)
CREATE TABLE IF NOT EXISTS blocked_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word TEXT NOT NULL UNIQUE,
  severity TEXT DEFAULT 'block' CHECK (severity IN ('block', 'flag', 'warn')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert common blocked words
INSERT INTO blocked_words (word, severity) VALUES
  ('spam', 'flag'),
  ('viagra', 'block'),
  ('cialis', 'block'),
  ('casino', 'flag'),
  ('porn', 'block'),
  ('xxx', 'block'),
  ('nude', 'block'),
  ('naked', 'block'),
  ('sex', 'flag'),
  ('fuck', 'block'),
  ('shit', 'flag'),
  ('ass', 'flag'),
  ('bitch', 'block'),
  ('cunt', 'block'),
  ('dick', 'flag'),
  ('cock', 'block'),
  ('nigger', 'block'),
  ('faggot', 'block'),
  ('retard', 'block'),
  ('kill yourself', 'block'),
  ('kys', 'block')
ON CONFLICT (word) DO NOTHING;

-- 4. Row Level Security
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read approved comments
CREATE POLICY "Public can read approved comments"
  ON comments FOR SELECT
  USING (status = 'approved');

-- Users can read their own pending comments
CREATE POLICY "Users can read own comments"
  ON comments FOR SELECT
  USING (user_id = auth.uid());

-- Anyone can insert comments (moderation happens in API)
CREATE POLICY "Anyone can insert comments"
  ON comments FOR INSERT
  WITH CHECK (true);

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  USING (user_id = auth.uid());

-- Admins can do anything (handled via service role key in API)

-- Comment votes RLS
ALTER TABLE comment_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read votes"
  ON comment_votes FOR SELECT
  USING (true);

CREATE POLICY "Anyone can vote"
  ON comment_votes FOR INSERT
  WITH CHECK (true);

-- 5. Function to get comment count for an article
CREATE OR REPLACE FUNCTION get_comment_count(article_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM comments
  WHERE article_id = article_uuid AND status = 'approved';
$$ LANGUAGE SQL STABLE;

-- 6. Add comment_count to articles for display
ALTER TABLE articles ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;

-- 7. Trigger to update comment count
CREATE OR REPLACE FUNCTION update_article_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE articles
    SET comment_count = (
      SELECT COUNT(*) FROM comments
      WHERE article_id = NEW.article_id AND status = 'approved'
    )
    WHERE id = NEW.article_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE articles
    SET comment_count = (
      SELECT COUNT(*) FROM comments
      WHERE article_id = OLD.article_id AND status = 'approved'
    )
    WHERE id = OLD.article_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_comment_count ON comments;
CREATE TRIGGER trigger_update_comment_count
  AFTER INSERT OR UPDATE OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_article_comment_count();
