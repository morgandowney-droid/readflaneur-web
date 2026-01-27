-- Tips submission system
-- Allows users to submit news tips with photos for specific neighborhoods

-- Create tips table
CREATE TABLE tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  headline TEXT,
  neighborhood_id TEXT NOT NULL REFERENCES neighborhoods(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Optional contact info for anonymous submissions
  submitter_name TEXT,
  submitter_email TEXT,
  submitter_phone TEXT,
  credit_preference TEXT DEFAULT 'anonymous' CHECK (credit_preference IN ('anonymous', 'name_only', 'name_and_contact')),
  allow_credit BOOLEAN DEFAULT false,

  -- Location tracking
  gps_latitude DECIMAL(10, 8),
  gps_longitude DECIMAL(11, 8),
  gps_accuracy DECIMAL(10, 2),

  -- Device tracking (for fraud prevention and verification)
  ip_address_hash TEXT, -- SHA256 hashed for privacy
  timezone TEXT,
  user_agent TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  screen_resolution TEXT,
  language TEXT,

  -- Photo URLs stored as JSONB array
  photo_urls JSONB DEFAULT '[]'::jsonb,

  -- Review workflow
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'converted')),
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  rejection_reason TEXT,

  -- Terms acceptance (required)
  terms_accepted BOOLEAN NOT NULL DEFAULT false,
  terms_accepted_at TIMESTAMPTZ,
  terms_version TEXT DEFAULT '1.0',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create tip_photos table for detailed photo metadata
CREATE TABLE tip_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tip_id UUID NOT NULL REFERENCES tips(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  filename TEXT,
  file_size INTEGER,
  mime_type TEXT,
  caption TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_tips_neighborhood_id ON tips(neighborhood_id);
CREATE INDEX idx_tips_user_id ON tips(user_id);
CREATE INDEX idx_tips_status ON tips(status);
CREATE INDEX idx_tips_created_at ON tips(created_at DESC);
CREATE INDEX idx_tips_status_created ON tips(status, created_at DESC);
CREATE INDEX idx_tip_photos_tip_id ON tip_photos(tip_id);

-- Enable RLS
ALTER TABLE tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE tip_photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tips

-- Anyone can insert tips (allows anonymous submissions)
CREATE POLICY "Anyone can submit tips"
  ON tips FOR INSERT
  WITH CHECK (true);

-- Users can view their own tips
CREATE POLICY "Users can view own tips"
  ON tips FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all tips
CREATE POLICY "Admins can view all tips"
  ON tips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admins can update tips (for review workflow)
CREATE POLICY "Admins can update tips"
  ON tips FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for tip_photos

-- Anyone can insert tip photos
CREATE POLICY "Anyone can insert tip photos"
  ON tip_photos FOR INSERT
  WITH CHECK (true);

-- View photos for tips user can see
CREATE POLICY "Users can view photos of own tips"
  ON tip_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tips
      WHERE tips.id = tip_photos.tip_id
      AND tips.user_id = auth.uid()
    )
  );

-- Admins can view all tip photos
CREATE POLICY "Admins can view all tip photos"
  ON tip_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_tips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tips_updated_at
  BEFORE UPDATE ON tips
  FOR EACH ROW
  EXECUTE FUNCTION update_tips_updated_at();
