-- Flaneur Platform Schema Updates
-- Run this in your Supabase SQL Editor to add new tables for the platform

-- 1. User Profiles (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'reader' CHECK (role IN ('reader', 'journalist', 'advertiser', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add new columns to articles table
ALTER TABLE articles
ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'pending', 'published', 'archived')),
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Add new columns to ads table
ALTER TABLE ads
ADD COLUMN IF NOT EXISTS advertiser_id UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'approved', 'active', 'paused', 'expired')),
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE,
ADD COLUMN IF NOT EXISTS impressions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS clicks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 4. Journalist neighborhood assignments
CREATE TABLE IF NOT EXISTS journalist_neighborhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journalist_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  neighborhood_id TEXT REFERENCES neighborhoods(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(journalist_id, neighborhood_id)
);

-- 5. Ad Packages / Pricing
CREATE TABLE IF NOT EXISTS ad_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  duration_days INTEGER NOT NULL,
  is_global BOOLEAN DEFAULT FALSE,
  max_neighborhoods INTEGER DEFAULT 1,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Ad Orders / Purchases
CREATE TABLE IF NOT EXISTS ad_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID REFERENCES profiles(id),
  ad_id UUID REFERENCES ads(id),
  package_id UUID REFERENCES ad_packages(id),
  stripe_payment_intent_id TEXT,
  stripe_session_id TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Ad analytics events
CREATE TABLE IF NOT EXISTS ad_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID REFERENCES ads(id) ON DELETE CASCADE,
  event_type TEXT CHECK (event_type IN ('impression', 'click')),
  user_agent TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast event queries
CREATE INDEX IF NOT EXISTS idx_ad_events_ad_id ON ad_events(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_events_created_at ON ad_events(created_at);

-- 8. Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'reader')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. Row Level Security Policies

-- Profiles: users can read all, update own
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Articles: public can read published, authors can manage own
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published articles" ON articles;
CREATE POLICY "Public can read published articles"
  ON articles FOR SELECT
  USING (status = 'published' OR status IS NULL);

CREATE POLICY "Authors can manage own articles"
  ON articles FOR ALL
  USING (auth.uid() = author_id);

-- Ads: public can read active, advertisers manage own
ALTER TABLE ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active ads" ON ads;
CREATE POLICY "Public can read active ads"
  ON ads FOR SELECT
  USING (status = 'active' OR status IS NULL);

CREATE POLICY "Advertisers can manage own ads"
  ON ads FOR ALL
  USING (auth.uid() = advertiser_id);

-- Ad packages: readable by all
ALTER TABLE ad_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ad packages are viewable by everyone"
  ON ad_packages FOR SELECT
  USING (active = true);

-- Ad orders: users can read own
ALTER TABLE ad_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders"
  ON ad_orders FOR SELECT
  USING (auth.uid() = advertiser_id);

CREATE POLICY "Users can create own orders"
  ON ad_orders FOR INSERT
  WITH CHECK (auth.uid() = advertiser_id);

-- 10. Insert default ad packages
INSERT INTO ad_packages (name, description, price_cents, duration_days, is_global, max_neighborhoods) VALUES
  ('Weekly Local', 'Perfect for local businesses', 5000, 7, FALSE, 1),
  ('Monthly Local', 'Best value for sustained presence', 15000, 30, FALSE, 1),
  ('City-Wide', 'Reach an entire city', 40000, 30, FALSE, 10),
  ('Global', 'Maximum reach across all markets', 80000, 30, TRUE, 100)
ON CONFLICT DO NOTHING;
