-- Create storage bucket for tip photos
-- This bucket allows public read access and anyone can upload (for anonymous tips)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tip-photos',
  'tip-photos',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for tip-photos bucket

-- Anyone can upload to tip-photos (for anonymous submissions)
CREATE POLICY "Anyone can upload tip photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'tip-photos');

-- Public read access for tip photos
CREATE POLICY "Public read access for tip photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tip-photos');

-- Admins can delete tip photos
CREATE POLICY "Admins can delete tip photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'tip-photos'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
