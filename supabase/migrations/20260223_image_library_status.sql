-- Image library status tracking
-- Tracks pre-generated image library progress per neighborhood
CREATE TABLE IF NOT EXISTS image_library_status (
  neighborhood_id TEXT PRIMARY KEY REFERENCES neighborhoods(id),
  images_generated INTEGER DEFAULT 0,
  last_generated_at TIMESTAMPTZ,
  generation_season TEXT,
  prompts_json JSONB,
  errors TEXT[],
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: public read for status checks, service_role write
ALTER TABLE image_library_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read image library status"
  ON image_library_status FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage image library status"
  ON image_library_status FOR ALL
  USING (auth.role() = 'service_role');
