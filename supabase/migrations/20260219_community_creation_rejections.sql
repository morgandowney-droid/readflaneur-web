-- Store rejected community neighborhood creation attempts for daily admin digest
CREATE TABLE IF NOT EXISTS community_creation_rejections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  input TEXT NOT NULL,
  rejection_reason TEXT,
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  emailed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for daily digest query (un-emailed rejections)
CREATE INDEX IF NOT EXISTS idx_community_rejections_unemailed
  ON community_creation_rejections (emailed, created_at) WHERE emailed = false;

-- RLS: service_role only
ALTER TABLE community_creation_rejections ENABLE ROW LEVEL SECURITY;
