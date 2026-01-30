-- Security fixes for Supabase Security Advisor warnings
-- Run this in your Supabase SQL Editor

-- 1. Enable RLS on journalist_neighborhoods
ALTER TABLE journalist_neighborhoods ENABLE ROW LEVEL SECURITY;

-- Journalists can view their own assignments
CREATE POLICY "Journalists can view own neighborhood assignments"
  ON journalist_neighborhoods FOR SELECT
  USING (auth.uid() = journalist_id);

-- Admins can manage all journalist assignments
CREATE POLICY "Admins can manage journalist neighborhoods"
  ON journalist_neighborhoods FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 2. Enable RLS on ad_events
ALTER TABLE ad_events ENABLE ROW LEVEL SECURITY;

-- Public can insert ad events (for tracking impressions/clicks)
CREATE POLICY "Public can insert ad events"
  ON ad_events FOR INSERT
  WITH CHECK (true);

-- Advertisers can view events for their own ads
CREATE POLICY "Advertisers can view own ad events"
  ON ad_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ads
      WHERE ads.id = ad_events.ad_id
      AND ads.advertiser_id = auth.uid()
    )
  );

-- Admins can view all ad events
CREATE POLICY "Admins can view all ad events"
  ON ad_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 3. Check if neighborhoods table needs RLS (core table from initial setup)
-- If it exists without RLS, enable it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'neighborhoods' AND schemaname = 'public'
  ) THEN
    ALTER TABLE neighborhoods ENABLE ROW LEVEL SECURITY;

    -- Neighborhoods are public read
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'neighborhoods' AND policyname = 'Neighborhoods are public'
    ) THEN
      CREATE POLICY "Neighborhoods are public"
        ON neighborhoods FOR SELECT
        USING (true);
    END IF;
  END IF;
END $$;

-- 4. Check if content_sources table needs RLS
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'content_sources' AND schemaname = 'public'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'content_sources' AND c.relrowsecurity = true
  ) THEN
    ALTER TABLE content_sources ENABLE ROW LEVEL SECURITY;

    -- Content sources are internal, only service role should access
    -- No public policies needed - API uses service role key
  END IF;
END $$;

-- 5. Check if ai_generation_queue table needs RLS
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'ai_generation_queue' AND schemaname = 'public'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'ai_generation_queue' AND c.relrowsecurity = true
  ) THEN
    ALTER TABLE ai_generation_queue ENABLE ROW LEVEL SECURITY;

    -- Queue is internal, only service role should access
    -- No public policies needed - API uses service role key
  END IF;
END $$;

-- 6. Check ai_authors table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'ai_authors' AND schemaname = 'public'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'ai_authors' AND c.relrowsecurity = true
  ) THEN
    ALTER TABLE ai_authors ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "AI authors are public"
      ON ai_authors FOR SELECT
      USING (true);
  END IF;
END $$;

-- 7. Newsletter subscribers table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'newsletter_subscribers' AND schemaname = 'public'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'newsletter_subscribers' AND c.relrowsecurity = true
  ) THEN
    ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

    -- Allow inserts for subscription
    CREATE POLICY "Anyone can subscribe to newsletter"
      ON newsletter_subscribers FOR INSERT
      WITH CHECK (true);

    -- Only admins can view subscribers
    CREATE POLICY "Admins can view newsletter subscribers"
      ON newsletter_subscribers FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
      );
  END IF;
END $$;
